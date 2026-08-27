import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type {
  CreateCollectionInput,
  CreateCollectionResult,
  CreatePayoutInput,
  PaymentGateway,
  PaymentStatus,
  PaymentWebhookEvent,
} from "@scopie/core";

/**
 * LeanX driver for the PaymentGateway port. Server-side only — nothing from
 * this file (names, URLs, statuses) may ever be forwarded to the client;
 * the web app knows only "Scopie Pay checkout".
 *
 * API shape verified against docs.leanx.io (Aug 2026):
 *  - Base: https://api.leanx.io (prod) / https://api.leanx.dev (sandbox),
 *    prefix /api/v1/merchant/.
 *  - Auth: `auth-token` header + HMAC-SHA256 request signature of
 *    METHOD|UUID|URL_PATH|UNIX_TS|AUTH_TOKEN|NONCE with the merchant Hash Key,
 *    sent as x-signature / x-timestamp / x-nonce (5-minute validity window).
 *  - White-label checkout: `create-bill-silent` (headless — returns a direct
 *    bank/wallet payment_url and DuitNow QR data). We deliberately never use
 *    `create-bill-page` (it renders a provider-branded page).
 *  - Webhooks: POST { data: <JWT>, response_code: 2100 } — JWT is HS256 signed
 *    with the Hash Key. Callbacks fire on SUCCESS ONLY, so PaymentsService
 *    runs a reconciliation poller via getPaymentStatus() for every open order.
 *  - No refund / split / escrow APIs exist: escrow is Scopie's own ledger.
 */
@Injectable()
export class LeanXGateway implements PaymentGateway {
  private readonly logger = new Logger(LeanXGateway.name);

  private get base(): string {
    return process.env.LEANX_BASE_URL ?? "https://api.leanx.dev";
  }
  private get authToken(): string {
    return process.env.LEANX_AUTH_TOKEN ?? "";
  }
  private get merchantUuid(): string {
    return process.env.LEANX_MERCHANT_UUID ?? "";
  }
  private get hashKey(): string {
    return process.env.LEANX_HASH_KEY ?? "";
  }

  get configured(): boolean {
    return Boolean(this.authToken && this.merchantUuid && this.hashKey);
  }

  private signedHeaders(method: string, urlPath: string): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const message = [method.toUpperCase(), this.merchantUuid, urlPath, ts, this.authToken, nonce].join("|");
    const signature = createHmac("sha256", this.hashKey).update(message).digest("hex");
    return {
      "auth-token": this.authToken,
      "x-signature": signature,
      "x-timestamp": ts,
      "x-nonce": nonce,
      "content-type": "application/json",
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.signedHeaders("POST", path),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { response_code: number; description?: string; data?: T };
    if (!res.ok || (json.response_code !== 2000 && json.response_code !== 2011 && json.response_code !== 2012)) {
      throw new Error(`gateway error ${json.response_code}: ${json.description ?? res.statusText}`);
    }
    return json.data as T;
  }

  async createCollection(input: CreateCollectionInput): Promise<CreateCollectionResult> {
    if (!this.configured) {
      // Demo mode: a fake hosted-checkout URL on scopie.io so the flow is testable.
      return {
        paymentUrl: `${input.returnUrl}?demo_paid=1&order=${encodeURIComponent(input.orderId)}`,
        providerRef: `demo-${input.orderId}`,
      };
    }
    if (!process.env.API_PUBLIC_URL) {
      // A configured gateway with no public callback URL would send success
      // webhooks to localhost and real payments would hang pending forever.
      throw new Error("API_PUBLIC_URL must be set when payment credentials are configured");
    }
    const path = "/api/v1/merchant/create-bill-silent";
    const data = await this.post<{ payment_url?: string; bill_no?: string; invoice_no?: string }>(path, {
      collection_uuid: process.env.LEANX_COLLECTION_UUID,
      amount: (input.amountSen / 100).toFixed(2), // gateway expects RM decimal
      currency: input.currency,
      invoice_ref: input.orderId, // idempotency key
      description: input.description,
      redirect_url: input.returnUrl,
      callback_url: `${process.env.API_PUBLIC_URL}/v1/payments/webhook/gateway`,
      // TODO: map methodHint -> payment_service_id via list-payment-services cache.
    });
    return {
      paymentUrl: data.payment_url ?? "",
      providerRef: data.invoice_no ?? data.bill_no ?? input.orderId,
    };
  }

  verifyWebhook(
    rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): PaymentWebhookEvent | null {
    // Never verify with a missing key: HMAC over an empty secret would let
    // anyone mint "valid" webhooks. Unconfigured gateway = no webhooks, ever.
    if (!this.configured) {
      this.logger.error("webhook received but gateway is not configured — rejected");
      return null;
    }
    try {
      const body = JSON.parse(rawBody.toString("utf8")) as { data?: string };
      if (!body.data) return null;
      const payload = this.verifyJwtHs256(body.data);
      if (!payload) return null;
      const orderId = String(
        (payload["client_data"] as Record<string, unknown> | undefined)?.["merchant_invoice_no"] ??
          payload["invoice_ref"] ??
          payload["invoice_no"],
      );
      const providerRef = String(payload["invoice_no"] ?? "");
      const status = String(payload["invoice_status"] ?? "").toUpperCase();
      const amountRm = Number(payload["amount"] ?? 0);
      if (status === "SUCCESS" || status === "PAID") {
        return {
          kind: "payment.succeeded",
          orderId,
          providerRef,
          amountSen: Math.round(amountRm * 100),
          raw: payload,
        };
      }
      // Only TERMINAL statuses count as failure — intermediate notifications
      // must never flip an order (a late replay could otherwise mark a paid
      // order failed).
      if (status === "FAILED" || status === "EXPIRED" || status === "CANCELLED") {
        return { kind: "payment.failed", orderId, providerRef, reason: status, raw: payload };
      }
      return { kind: "payment.pending", orderId, providerRef, raw: payload };
    } catch (err) {
      this.logger.warn(`webhook parse failure: ${(err as Error).message}`);
      return null;
    }
  }

  /** Minimal HS256 JWT verification with the merchant hash key (no deps). */
  private verifyJwtHs256(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", this.hashKey).update(`${header}.${payload}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatus> {
    if (!this.configured) {
      // Only refs this demo gateway itself minted resolve as paid; anything
      // else stays pending so a half-configured deployment can never
      // auto-mark real orders paid.
      return providerRef.startsWith("demo-") ? "paid" : "pending";
    }
    const path = `/api/v1/merchant/manual-checking-transaction?invoice_no=${encodeURIComponent(providerRef)}`;
    try {
      const data = await this.post<{ invoice_status?: string }>(path, {});
      const s = String(data.invoice_status ?? "").toUpperCase();
      if (s === "SUCCESS" || s === "PAID") return "paid";
      if (s === "FAILED") return "failed";
      if (s === "EXPIRED") return "expired";
      return "pending";
    } catch {
      return "pending";
    }
  }

  async createPayout(input: CreatePayoutInput): Promise<{ providerRef: string; status: "queued" | "sent" }> {
    if (!this.configured) return { providerRef: `demo-payout-${input.payoutId}`, status: "queued" };
    if (!process.env.API_PUBLIC_URL) {
      throw new Error("API_PUBLIC_URL must be set when payment credentials are configured");
    }
    const path = "/api/v1/merchant/create-payout-invoice";
    const data = await this.post<{ invoice_no?: string }>(path, {
      virtual_pool_reference: process.env.LEANX_PAYOUT_POOL_REF,
      // TODO: resolve payout_service_id from list-payout-services by bankCode.
      amount: (input.amountSen / 100).toFixed(2),
      recipient_name: input.accountHolder, // must match check-verification-bank result at onboarding
      third_party_account_no: input.accountNumber,
      recipient_reference: `SCOPIE-${input.payoutId}`.slice(0, 20),
      external_invoice_ref: input.payoutId, // idempotency
      client_callback_url: `${process.env.API_PUBLIC_URL}/v1/payments/webhook/payout`,
    });
    return { providerRef: data.invoice_no ?? input.payoutId, status: "sent" };
  }
}
