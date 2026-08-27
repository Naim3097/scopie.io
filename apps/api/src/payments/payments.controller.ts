import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { PaymentGateway } from "@scopie/core";
import { PaymentsService } from "./payments.service";

/** Exact-origin allowlist — never string prefixes (scopie.io.evil.com must fail). */
function isAllowedReturnOrigin(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    return url.origin === "https://scopie.io" || url.origin === "https://www.scopie.io";
  } catch {
    return false;
  }
}

const CheckoutBody = z.object({
  orderId: z.string().uuid(),
  buyerId: z.string().min(1),
  // Price is derived server-side from the product — the client never names an amount.
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  returnUrl: z.string().url().refine(isAllowedReturnOrigin, "returnUrl must be a Scopie origin"),
});

@Controller("v1/payments")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject("PAYMENT_GATEWAY") private readonly gateway: PaymentGateway,
  ) {}

  /** Client-facing: returns only { paymentUrl }. Branded as Scopie Pay in the app. */
  @Post("checkout")
  async checkout(@Body() body: unknown) {
    const parsed = CheckoutBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.payments.createCheckout(parsed.data);
  }

  /**
   * Authoritative order status for the return page (which must never claim
   * success from a mere redirect) and for reconciliation. Triggers a gateway
   * poll when the order is still pending — the gateway's webhooks fire on
   * success only.
   */
  @Get("orders/:orderId/status")
  async orderStatus(@Param("orderId") orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success) throw new BadRequestException("invalid order id");
    return this.payments.getOrderStatus(orderId);
  }

  /** Gateway callback. Signature-verified; forgeries are rejected and logged. */
  @Post("webhook/gateway")
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException("missing raw body");
    const event = this.gateway.verifyWebhook(raw, req.headers as Record<string, string | string[] | undefined>);
    if (!event) throw new ForbiddenException("invalid signature");
    await this.payments.handleWebhook(event);
    return { ok: true };
  }

  /** Payout status callback (success-only from the provider; poller covers the rest). */
  @Post("webhook/payout")
  async payoutWebhook(@Req() _req: RawBodyRequest<Request>) {
    // TODO: verify + mark payout row settled once payouts are automated.
    return { ok: true };
  }
}
