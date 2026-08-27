import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Db } from "./db";
import { FeedController } from "./feed/feed.controller";
import { FeedService } from "./feed/feed.service";
import { EventsController } from "./events/events.controller";
import { EventsService } from "./events/events.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { LiveController } from "./live/live.controller";
import { LiveService } from "./live/live.service";
import { PaymentsController } from "./payments/payments.controller";
import { PaymentsService } from "./payments/payments.service";
import { LeanXGateway } from "./payments/payment-gateway.leanx";
import { WalletController } from "./wallet/wallet.controller";
import { WalletService } from "./wallet/wallet.service";
import { AgentsController } from "./agents/agents.controller";

@Module({
  imports: [
    // Blunt per-IP rate limit on every route: an unauthenticated public API
    // (events ingest especially) must not be a free write-amplifier.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    FeedController,
    EventsController,
    ProductsController,
    LiveController,
    PaymentsController,
    WalletController,
    AgentsController,
  ],
  providers: [
    Db,
    FeedService,
    EventsService,
    ProductsService,
    LiveService,
    PaymentsService,
    WalletService,
    // The payment gateway is bound by PORT, not by vendor. Swapping providers
    // is a one-line change here and nowhere else.
    { provide: "PAYMENT_GATEWAY", useClass: LeanXGateway },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
