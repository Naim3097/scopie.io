import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentGateway, PaymentStatus, PaymentWebhookEvent } from "@scopie/core";
import { WalletService } from "../wallet/wallet.service";
import { ProductsService } from "../products/products.service";
import { Db } from "../db";
import { BoundedMap } from "../util/bounded-map";

/** Platform commission at MVP. Move to per-seller config in Mercur later. */
const COMMISSION_BPS = 800; // 8.00%

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckoutRequest {
  orderId: string;
  buyerId: string;
  /** Price is derived server-side from the product — never from the client. */
  productId: string;
  quantity: number;
  returnUrl: string;
}

interface DemoOrder {
  amountSen: number;
  sellerId: string;
  productId: string;
  status: PaymentStatus;
  providerRef: string | null;
}

/**
 * Orchestrates the money flow. Escrow is OUR ledger state (the gateway has no
 * holds). Correctness rules (from two adversarial reviews — keep them):
 *
 *  - The order record exists BEFORE the gateway call. Demo-identity orders
 *    (non-UUID buyer/seller) live in the bounded in-memory demoOrders map;
 *    UUID orders live in Postgres. Status/webhook paths consult BOTH, so a
 *    half-configured deployment can never lose an order between worlds.
 *  - markPaid flips status and posts escrow atomically, is idempotent (ledger
 *    unique (ref_type, ref_id)), verifies amounts, and throws 5xx for unknown
 *    orders so the gateway retries rather than getting a false ack.
 *  - 'demo-' provider refs are NEVER polled against the DB path — a
 *    credential-less deployment must not auto-mark real rows paid.
 *  - The gateway's webhooks fire on success only, so a reconciliation loop
 *    drives every open DB order to a terminal state (60s cadence).
 */
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly demoOrders = new BoundedMap<string, DemoOrder>(5000);
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject("PAYMENT_GATEWAY") private readonly gateway: PaymentGateway,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(Db) private readonly db: Db,
  ) {}

  onModuleInit(): void {
    // Reconciliation only matters when real orders can exist (DB + gateway).
    const gatewayConfigured = (this.gateway as { configured?: boolean }).configured === true;
    if (this.db.available && gatewayConfigured) {
      this.reconcileTimer = setInterval(() => {
        void this.reconcilePending().catch((err: Error) =>
          this.logger.error(`reconciliation pass failed: ${err.message}`),
        );
      }, 60_000);
      this.logger.log("payment reconciliation loop armed (60s)");
    }
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  /** Drive open orders to a terminal state — webhooks are success-only. */
  async reconcilePending(): Promise<void> {
    const pool = this.db.get();
    if (!pool) return;
    const res = await pool.query(
      `select id, amount_sen, provider_ref from orders_ref
       where payment_status='pending' and provider_ref is not null
         and provider_ref not like 'demo-%'
         and created_at > now() - interval '24 hours'
       limit 50`,
    );
    for (const row of res.rows) {
      const status = await this.gateway.getPaymentStatus(row.provider_ref as string);
      if (status === "paid") {
        await this.markPaid(row.id as string, Number(row.amount_sen));
      } else if (status === "failed" || status === "expired") {
        await pool.query(
          `update orders_ref set payment_status=$2, updated_at=now() where id=$1 and payment_status='pending'`,
          [row.id, status],
        );
      }
    }
    // Stale pending orders past the gateway's own bill lifetime expire.
    await pool.query(
      `update orders_ref set payment_status='expired', updated_at=now()
       where payment_status='pending' and created_at < now() - interval '24 hours'`,
    );
  }

  async createCheckout(req: CheckoutRequest): Promise<{ paymentUrl: string }> {
    const product = await this.products.getById(req.productId);
    if (!product) throw new NotFoundException("product not found");
    const amountSen = product.priceSen * req.quantity;

    const pool = this.db.get();
    const isDbOrder = Boolean(pool) && UUID_RE.test(req.buyerId) && UUID_RE.test(product.sellerId);
    if (isDbOrder && pool) {
      // Row exists BEFORE the gateway knows about the order. A re-call with
      // the same orderId must not change the amount (insert-only semantics).
      try {
        const res = await pool.query(
          `insert into orders_ref (id, buyer_id, seller_id, product_id, quantity, amount_sen)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (id) do nothing
           returning id`,
          [req.orderId, req.buyerId, product.sellerId, product.id, req.quantity, amountSen],
        );
        if (res.rowCount === 0) {
          const existing = await pool.query(`select amount_sen, payment_status from orders_ref where id=$1`, [
            req.orderId,
          ]);
          const row = existing.rows[0];
          if (!row || Number(row.amount_sen) !== amountSen || row.payment_status !== "pending") {
            throw new ConflictException("order already exists with different terms");
          }
        }
      } catch (err) {
        if ((err as { code?: string }).code === "23503") {
          throw new BadRequestException("unknown buyer or seller");
        }
        throw err;
      }
    } else {
      const existing = this.demoOrders.get(req.orderId);
      if (existing && existing.amountSen !== amountSen) {
        throw new ConflictException("order already exists with different terms");
      }
      this.demoOrders.set(req.orderId, {
        amountSen,
        sellerId: product.sellerId,
        productId: product.id,
        status: "pending",
        providerRef: null,
      });
    }

    const result = await this.gateway.createCollection({
      orderId: req.orderId,
      amountSen,
      currency: "MYR",
      buyerId: req.buyerId,
      description: product.title.slice(0, 140),
      returnUrl: req.returnUrl,
    });
    if (isDbOrder && pool) {
      await pool.query(`update orders_ref set provider_ref=$2, updated_at=now() where id=$1`, [
        req.orderId,
        result.providerRef,
      ]);
    } else {
      const entry = this.demoOrders.get(req.orderId);
      if (entry) entry.providerRef = result.providerRef;
    }
    // White-label boundary: only the paymentUrl crosses to the client.
    return { paymentUrl: result.paymentUrl };
  }

  async handleWebhook(event: PaymentWebhookEvent): Promise<void> {
    if (event.kind === "payment.pending") return; // acknowledged, never state-changing
    if (event.kind === "payment.succeeded") {
      await this.markPaid(event.orderId, event.amountSen);
      return;
    }
    this.logger.warn(`payment failed for order ${event.orderId}: ${event.reason}`);
    const pool = this.db.get();
    if (pool && UUID_RE.test(event.orderId)) {
      // Guarded: a late failure webhook can never flip a paid order.
      await pool.query(
        `update orders_ref set payment_status='failed', updated_at=now()
         where id=$1 and payment_status='pending'`,
        [event.orderId],
      );
      return;
    }
    const demo = this.demoOrders.get(event.orderId);
    if (demo && demo.status === "pending") demo.status = "failed";
  }

  private async markPaidDemo(orderId: string, amountSen: number): Promise<void> {
    const demo = this.demoOrders.get(orderId);
    if (!demo) {
      // 5xx so the gateway retries — never a false ack for real money.
      throw new InternalServerErrorException(`webhook for unknown order ${orderId}`);
    }
    if (demo.status !== "pending") return;
    if (demo.amountSen !== amountSen) {
      this.logger.error(`AMOUNT MISMATCH on ${orderId}: expected ${demo.amountSen}, webhook says ${amountSen}`);
      return;
    }
    demo.status = "paid";
    await this.wallet.post(randomUUID(), "order_payment", orderId, [
      { accountId: "external:gateway", amount: -amountSen, currency: "MYR" },
      { accountId: `escrow:${orderId}`, amount: amountSen, currency: "MYR" },
    ]);
  }

  /**
   * Idempotent and atomic. Safe to call from webhook AND reconciliation.
   * Consults Postgres first, then the demo store — an order can never be
   * lost between worlds.
   */
  async markPaid(orderId: string, amountSen: number): Promise<void> {
    const pool = this.db.get();
    if (!pool || !UUID_RE.test(orderId) || (!(await this.dbOrderExists(orderId)) && this.demoOrders.has(orderId))) {
      return this.markPaidDemo(orderId, amountSen);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        `select amount_sen, payment_status from orders_ref where id=$1 for update`,
        [orderId],
      );
      const row = existing.rows[0];
      if (!row) {
        // Unknown order: 5xx so the gateway retries — never a false ack.
        throw new InternalServerErrorException(`webhook for unknown order ${orderId}`);
      }
      if (row.payment_status !== "pending") {
        await client.query("rollback");
        return; // genuinely already processed
      }
      if (Number(row.amount_sen) !== amountSen) {
        await client.query("rollback");
        // Quarantine: never escrow a mismatched amount.
        this.logger.error(
          `AMOUNT MISMATCH on ${orderId}: order says ${row.amount_sen}, gateway says ${amountSen} — quarantined`,
        );
        return;
      }
      await client.query(`update orders_ref set payment_status='paid', updated_at=now() where id=$1`, [orderId]);
      await this.wallet.post(
        randomUUID(),
        "order_payment",
        orderId,
        [
          { accountId: "external:gateway", amount: -amountSen, currency: "MYR" },
          { accountId: `escrow:${orderId}`, amount: amountSen, currency: "MYR" },
        ],
        client,
      );
      // The server-side purchase signal — joins on PRODUCT id (the taxonomy's
      // subject for product events); the order id rides in meta.
      await client.query(
        `insert into engagement_events (event_type, user_id, subject_id, surface, meta)
         select 'product.purchase', buyer_id::text, coalesce(product_id, id::text), 'shop',
                jsonb_build_object('orderId', id, 'quantity', quantity)
         from orders_ref where id=$1`,
        [orderId],
      );
      await client.query("commit");
      this.logger.log(`order ${orderId} paid — RM ${(amountSen / 100).toFixed(2)} in escrow`);
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async dbOrderExists(orderId: string): Promise<boolean> {
    const pool = this.db.get();
    if (!pool || !UUID_RE.test(orderId)) return false;
    const res = await pool.query(`select 1 from orders_ref where id=$1`, [orderId]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Called on delivery confirmation (or auto-release timer). Conditional
   * state transition + DB-derived amount: double calls release nothing twice.
   * NOTE: no caller is wired yet — the delivery-confirmation flow lands with
   * the commerce backend; until then settlement is a manual ops action.
   */
  async releaseEscrow(orderId: string): Promise<void> {
    const pool = this.db.get();
    if (!pool) throw new Error("escrow release requires a database");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const res = await client.query(
        `update orders_ref set escrow_released=true, updated_at=now()
         where id=$1 and payment_status='paid' and escrow_released=false
         returning amount_sen, seller_id`,
        [orderId],
      );
      const row = res.rows[0];
      if (!row) {
        await client.query("rollback");
        this.logger.warn(`releaseEscrow(${orderId}): not paid or already released — no-op`);
        return;
      }
      const amountSen = Number(row.amount_sen);
      const fee = Math.floor((amountSen * COMMISSION_BPS) / 10_000);
      await this.wallet.post(
        randomUUID(),
        "order_release",
        orderId,
        [
          { accountId: `escrow:${orderId}`, amount: -amountSen, currency: "MYR" },
          { accountId: `seller:${row.seller_id}`, amount: amountSen - fee, currency: "MYR" },
          { accountId: "platform:fees", amount: fee, currency: "MYR" },
        ],
        client,
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Authoritative status for the return page + reconciliation. */
  async getOrderStatus(orderId: string): Promise<{ status: PaymentStatus }> {
    const pool = this.db.get();

    // DB path first; fall through to the demo store if the row is absent.
    if (pool && UUID_RE.test(orderId)) {
      const res = await pool.query(
        `select payment_status, provider_ref, amount_sen from orders_ref where id=$1`,
        [orderId],
      );
      const row = res.rows[0];
      if (row) {
        const ref = row.provider_ref as string | null;
        if (row.payment_status === "pending" && ref && !ref.startsWith("demo-")) {
          const s = await this.gateway.getPaymentStatus(ref);
          if (s === "paid") {
            await this.markPaid(orderId, Number(row.amount_sen));
            return { status: "paid" };
          }
          if (s === "failed" || s === "expired") {
            await pool.query(
              `update orders_ref set payment_status=$2, updated_at=now() where id=$1 and payment_status='pending'`,
              [orderId, s],
            );
            return { status: s };
          }
        } else if (row.payment_status === "pending" && ref?.startsWith("demo-")) {
          // A real row with a demo ref means the gateway wasn't configured at
          // checkout time. Never auto-mark it paid.
          this.logger.warn(`order ${orderId} carries a demo provider ref — staying pending`);
        }
        return { status: row.payment_status as PaymentStatus };
      }
    }

    const demo = this.demoOrders.get(orderId);
    if (!demo) throw new NotFoundException("order not found");
    if (demo.status === "pending" && demo.providerRef) {
      const s = await this.gateway.getPaymentStatus(demo.providerRef);
      if (s === "paid") await this.markPaidDemo(orderId, demo.amountSen);
      else if (s === "failed" || s === "expired") demo.status = s;
    }
    return { status: this.demoOrders.get(orderId)!.status };
  }
}
