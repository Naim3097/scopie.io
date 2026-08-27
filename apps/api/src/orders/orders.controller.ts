import { BadRequestException, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PaymentsService } from "../payments/payments.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

/** Buyer-facing order actions. */
@Controller("v1/orders")
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  /**
   * Confirm delivery → releases escrow to the seller (minus commission).
   * Owner-scoped; only valid from the 'shipped' state.
   */
  @Post(":orderId/confirm-delivery")
  async confirmDelivery(@Param("orderId") orderId: string, @CurrentUser() user: AuthedUser) {
    if (!z.string().uuid().safeParse(orderId).success) throw new BadRequestException("invalid order id");
    return this.payments.confirmDelivery(orderId, user.id);
  }
}
