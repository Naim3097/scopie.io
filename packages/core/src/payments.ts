/**
 * Payment gateway port (hexagonal). The app depends on this interface only;
 * the concrete driver (LeanX) lives in apps/api and is swappable.
 *
 * White-label rule: nothing from this layer — provider names, URLs, error
 * strings — may ever be serialized into a client-visible payload. The web app
 * knows only "Scopie Pay checkout".
 */

export type PaymentMethodHint = "fpx" | "duitnow_qr" | "ewallet" | "card";

export interface CreateCollectionInput {
  /** Scopie's own order id — the idempotency key for the whole flow. */
  orderId: string;
  amountSen: number;
  currency: "MYR";
  buyerId: string;
  description: string;
  /** Where the hosted checkout should return the buyer to (scopie.io URL). */
  returnUrl: string;
  methodHint?: PaymentMethodHint;
}

export interface CreateCollectionResult {
  /** Hosted checkout URL the buyer is redirected to (branded as Scopie). */
  paymentUrl: string;
  /** Provider-side reference, stored server-side only. */
  providerRef: string;
}

export type PaymentWebhookEvent =
  | { kind: "payment.succeeded"; orderId: string; providerRef: string; amountSen: number; raw: unknown }
  | { kind: "payment.failed"; orderId: string; providerRef: string; reason: string; raw: unknown }
  /** Intermediate/unknown statuses — acknowledged and ignored, never state-changing. */
  | { kind: "payment.pending"; orderId: string; providerRef: string; raw: unknown };

export interface CreatePayoutInput {
  /** Seller payout after commission split — phase 2 automation, manual at MVP. */
  payoutId: string;
  sellerId: string;
  amountSen: number;
  currency: "MYR";
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "expired";

export interface PaymentGateway {
  createCollection(input: CreateCollectionInput): Promise<CreateCollectionResult>;
  /**
   * Verify and parse a webhook. Returns null when the signature is invalid —
   * callers must treat null as a potential forgery and log it.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent | null;
  /**
   * Poll the authoritative status of a payment. Required: some gateways fire
   * webhooks on success only, so open orders must be reconciled by polling
   * until paid, failed, or expired.
   */
  getPaymentStatus(providerRef: string): Promise<PaymentStatus>;
  createPayout(input: CreatePayoutInput): Promise<{ providerRef: string; status: "queued" | "sent" }>;
}
