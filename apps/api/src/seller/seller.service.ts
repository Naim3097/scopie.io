import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Product } from "@scopie/core";
import { Db } from "../db";
import { CommerceService, NewProductInput } from "../commerce/commerce.service";
import { WalletService } from "../wallet/wallet.service";
import { ProfilesService } from "../auth/profiles.service";
import type { AuthedUser } from "../auth/auth.service";
import { BoundedMap } from "../util/bounded-map";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SellerProfile {
  id: string;
  shopName: string;
  status: "pending" | "active" | "suspended";
}

export interface SellerOrder {
  orderId: string;
  productId: string | null;
  amountSen: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
}

/**
 * Seller Centre backend: onboarding, product authoring, orders, payable
 * balance, and fulfillment. A seller is a profile with is_seller=true plus a
 * sellers row. Guests cannot sell. Demo mode keeps sellers in memory so the
 * flow works with no database.
 */
@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);
  private readonly demoSellers = new BoundedMap<string, SellerProfile>(5000);

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CommerceService) private readonly commerce: CommerceService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ProfilesService) private readonly profiles: ProfilesService,
  ) {}

  /**
   * DB rows are for real (non-guest, uuid) identities only — the same
   * discipline PaymentsService uses. A guest identity in DB+demo-auth mode
   * (local Postgres, no Supabase secret) routes to the in-memory store; a
   * 'guest:x' string must never hit a uuid column.
   */
  private isDbIdentity(user: AuthedUser): boolean {
    return Boolean(this.db.get()) && !user.isGuest && UUID_RE.test(user.id);
  }

  // Note: a guest identity only ever occurs in demo mode (configured mode
  // requires a real token or 401s), so guest sellers are the demo sandbox —
  // not a hole. The guard is on state-changing actions being scoped to the
  // caller's own identity, which the ownership checks enforce regardless.
  async onboard(user: AuthedUser, shopName: string): Promise<SellerProfile> {
    const clean = shopName.trim().slice(0, 80);
    if (clean.length < 2) throw new ConflictException("Shop name is too short.");
    const pool = this.db.get();
    if (pool && this.isDbIdentity(user)) {
      await this.profiles.ensure(user);
      await pool.query(
        `insert into sellers (id, shop_name) values ($1,$2)
         on conflict (id) do update set shop_name=excluded.shop_name, updated_at=now()`,
        [user.id, clean],
      );
      await pool.query(`update profiles set is_seller=true where id=$1`, [user.id]);
      return { id: user.id, shopName: clean, status: "active" };
    }
    const seller: SellerProfile = { id: user.id, shopName: clean, status: "active" };
    this.demoSellers.set(user.id, seller);
    return seller;
  }

  async getSeller(user: AuthedUser): Promise<SellerProfile | null> {
    const pool = this.db.get();
    if (pool && this.isDbIdentity(user)) {
      const res = await pool.query(`select id, shop_name, status from sellers where id=$1`, [user.id]);
      const row = res.rows[0];
      return row ? { id: row.id, shopName: row.shop_name, status: row.status } : null;
    }
    return this.demoSellers.get(user.id) ?? null;
  }

  private async requireSeller(user: AuthedUser): Promise<SellerProfile> {
    const seller = await this.getSeller(user);
    if (!seller) throw new ForbiddenException("You're not registered as a seller yet.");
    if (seller.status !== "active") throw new ForbiddenException("Your shop isn't active.");
    return seller;
  }

  async addProduct(user: AuthedUser, input: NewProductInput): Promise<Product> {
    const seller = await this.requireSeller(user);
    return this.commerce.createProduct(seller.id, input);
  }

  async myProducts(user: AuthedUser): Promise<Product[]> {
    const seller = await this.requireSeller(user);
    return this.commerce.listSellerProducts(seller.id);
  }

  async myOrders(user: AuthedUser): Promise<SellerOrder[]> {
    const seller = await this.requireSeller(user);
    const pool = this.db.get();
    if (!pool || !this.isDbIdentity(user)) return []; // demo identities have no DB orders
    const res = await pool.query(
      `select id, product_id, amount_sen, payment_status, fulfillment_status, created_at
       from orders_ref where seller_id=$1 order by created_at desc limit 100`,
      [seller.id],
    );
    return res.rows.map((r) => ({
      orderId: r.id,
      productId: r.product_id,
      amountSen: Number(r.amount_sen),
      paymentStatus: r.payment_status,
      fulfillmentStatus: r.fulfillment_status,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  /** Payable balance from the ledger (seller:<id>), in sen. */
  async myBalanceSen(user: AuthedUser): Promise<number> {
    const seller = await this.requireSeller(user);
    const balances = await this.wallet.balancesFor([`seller:${seller.id}`]);
    return balances.reduce((sum, b) => sum + b.balance, 0);
  }

  /** Seller marks an order shipped. Only a paid, unfulfilled order can ship. */
  async shipOrder(user: AuthedUser, orderId: string, trackingRef?: string): Promise<{ status: string }> {
    const seller = await this.requireSeller(user);
    const pool = this.db.get();
    if (!pool || !this.isDbIdentity(user)) throw new NotFoundException("order not found");
    const res = await pool.query(
      `update orders_ref set fulfillment_status='shipped', shipped_at=now(), tracking_ref=$3, updated_at=now()
       where id=$1 and seller_id=$2 and payment_status='paid' and fulfillment_status='unfulfilled'
       returning id`,
      [orderId, seller.id, trackingRef ?? null],
    );
    if (res.rowCount === 0) throw new ConflictException("order can't be shipped in its current state");
    return { status: "shipped" };
  }
}
