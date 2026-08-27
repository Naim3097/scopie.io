import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

@Controller("v1/wallet")
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  /**
   * Own balances only — identity comes from the token, so there is nothing
   * to enumerate. Earned SCOP credits only: no stored RM value at MVP by
   * design (BNM e-money policy). Sellers read their payable balance via
   * GET /v1/seller/balance.
   */
  @Get("me")
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthedUser) {
    const scop = await this.wallet.balancesFor([`scop:${user.id}`]);
    return {
      scopCredits: scop.reduce((sum, b) => sum + b.balance, 0),
    };
  }
}
