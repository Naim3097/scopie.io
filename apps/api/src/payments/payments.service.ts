import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentGateway, PaymentStatus, PaymentWebhookEvent } from "@scopie/core";
import { WalletService } from "../wallet/wallet.service";
import { ProductsService } from "../products/products.service";
import { Db } from "../db";

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

/**
 * Orchestrates the money flow. Escrow is OUR ledger state (the gateway has no
 * holds): payment lands in escrow:<order>, release on delivery confirmation
 * splits commission to platform:fees and the rest to seller:<id>.
 *
 * Correctness rules (from the adversarial review — keep them):
 *  - The orders_ref row is written BEFORE the gateway call, so a webhook can
 *    never race a missing order; a webhook for an unknown order throws (5xx)
 *    so the gateway retries instead of getting a false ack.
 *  - markPaid flips status and posts escrow in ONE Postgres transaction, and
 *    the ledger's (ref_type, ref_id) uniqueness makes replays no-ops.
 *  - Amounts from webhooks are compared against the stored order amount;
 *    mismatches are quarantined, never escrowed.
 *  - releaseEscrow is a conditional state transition using the DB's amount.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** Demo-mode order store so the flow works with no database. */
  private demoOrders = new Map<string, { amountSen: number; sellerId: string; status: PaymentStatus }>();

  constructor(
    @Inject("PAYMENT_GATEWAY") private readonly gateway: PaymentGateway,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(Db) private readonly db: Db,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<{ paymentUrl: string }> {
    const product = await this.products.getById(req.productId);
    if (!product) throw new NotFoundException("product not found");
    const amountSen = product.priceSen * req.quantity;

    const pool = this.db.get();
    if (pool && UUID_RE.test(req.buyerId) && UUID_RE.test(product.sellerId)) {
      // Row exists BEFORE the gateway knows about the order. A re-call with
      // the same orderId must not change the amount (insert-only semantics).
      const res = await pool.query(
        `insert into orders_ref (id, buyer_id, seller_id, amount_sen)
         values ($1,$2,$3,$4)
         on conflict (id) do nothing
         returning id`,
        [req.orderId, req.buyerId, product.sellerId, amountSen],
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
    } else {
      const existing = this.demoOrders.get(req.orderId);
      if (existing && existing.amountSen !== amountSen) {
        throw new ConflictException("order already exists with different terms");
      }
      this.demoOrders.set(req.orderId, { amountSen, sellerId: product.sellerId, status: "pending" });
    }

    const result = await this.gateway.createCollection({
      orderId: req.orderId,
      amountSen,
      currency: "MYR",
      buyerId: req.buyerId,
      description: product.title.slice(0, 140),
      returnUrl: req.returnUrl,
    });
    if (pool && UUID_RE.test(req.buyerId)) {
      await pool.query(`update orders_ref set provider_ref=$2, updated_at=now() where id=$1`, [
        req.orderId,
        result.providerRef,
      ]);
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
    if (pool) {
      // Guarded: a late failure webhook can never flip a paid order.
      await pool.query(
        `update orders_ref set payment_status='failed', updated_at=now()
         where id=$1 and payment_status='pending'`,
        [event.orderId],
      );
    } else {
      const demo = this.demoOrders.get(event.orderId);
      if (demo && demo.status === "pending") demo.status = "failed";
    }
  }

  /**
   * Idempotent and atomic: the status flip and the escrow legs commit (or
   * roll back) together. Safe to call from webhook AND reconciliation poller.
   */
  async markPaid(orderId: string, amountSen: number): Promise<void> {
    const pool = this.db.get();
    if (!pool) {
      const demo = this.demoOrders.get(orderId);
      if (!demo) throw new NotFoundException(`unknown order ${orderId}`);
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
      return;
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
        // Unknown order: throw so the endpoint 5xxs and the gateway retries —
        // never a false ack for real money.
        throw new NotFoundException(`webhook for unknown order ${orderId}`);
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
      // The server-side purchase signal for the recommender — clients cannot inject this.
      await client.query(
        `insert into engagement_events (event_type, user_id, subject_id, surface)
         select 'product.purchase', buyer_id::text, id::text, 'shop' from orders_ref where id=$1`,
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

  /**
   * Called on delivery confirmation (or auto-release timer). Conditional
   * state transition + DB-derived amount: double calls release nothing twice.
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

  /** Authoritative status for the return page + reconciliation poller. */
  async getOrderStatus(orderId: string): Promise<{ status: PaymentStatus }> {
    const pool = this.db.get();
    if (!pool) {
      const demo = this.demoOrders.get(orderId);
      if (!demo) throw new NotFoundException("order not found");
      if (demo.status === "pending") {
        // Reconcile against the gateway (demo gateway resolves demo refs as paid).
        const s = await this.gateway.getPaymentStatus(`demo-${orderId}`);
        if (s === "paid") await this.markPaid(orderId, demo.amountSen);
        return { status: this.demoOrders.get(orderId)!.status };
      }
      return { status: demo.status };
    }
    const res = await pool.query(`select payment_status, provider_ref, amount_sen from orders_ref where id=$1`, [
      orderId,
    ]);
    const row = res.rows[0];
    if (!row) throw new NotFoundException("order not found");
    if (row.payment_status === "pending" && row.provider_ref) {
      const s = await this.gateway.getPaymentStatus(row.provider_ref as string);
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
    }
    return { status: row.payment_status as PaymentStatus };
  }
}
