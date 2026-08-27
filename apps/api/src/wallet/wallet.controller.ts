import { BadRequestException, Controller, Get, Inject, Param } from "@nestjs/common";
import { WalletService } from "./wallet.service";

/** Account ids embed user ids — reject anything that could smuggle patterns. */
const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

@Controller("v1/wallet")
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  /**
   * Buyer-facing balances: earned SCOP credits only. There is no stored RM
   * value at MVP by design (BNM e-money policy). Sellers see their payable
   * balance in the Seller Centre via a separate authenticated route later.
   */
  @Get(":userId")
  async get(@Param("userId") userId: string) {
    if (!SAFE_USER_ID.test(userId)) throw new BadRequestException("invalid user id");
    const scop = await this.wallet.balancesFor([`scop:${userId}`]);
    return {
      scopCredits: scop.reduce((sum, b) => sum + b.balance, 0),
    };
  }
}
