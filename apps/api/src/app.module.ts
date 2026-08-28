import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Db } from "./db";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/auth.guard";
import { ProfilesService } from "./auth/profiles.service";
import { FeedController } from "./feed/feed.controller";
import { FeedService } from "./feed/feed.service";
import { EventsController } from "./events/events.controller";
import { EventsService } from "./events/events.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { LiveController } from "./live/live.controller";
import { LiveService } from "./live/live.service";
import { LiveChatService } from "./live/live-chat.service";
import { HostBrainService } from "./live/host-brain.service";
import { PaymentsController } from "./payments/payments.controller";
import { PaymentsService } from "./payments/payments.service";
import { LeanXGateway } from "./payments/payment-gateway.leanx";
import { WalletController } from "./wallet/wallet.controller";
import { WalletService } from "./wallet/wallet.service";
import { AgentsController } from "./agents/agents.controller";
import { CommerceService } from "./commerce/commerce.service";
import { MeiliService } from "./commerce/meili.service";
import { VideosController } from "./videos/videos.controller";
import { VideosService } from "./videos/videos.service";
import { StreamService } from "./videos/stream.service";
import { ModerationService } from "./videos/moderation.service";
import { SellerController } from "./seller/seller.controller";
import { SellerService } from "./seller/seller.service";
import { OrdersController } from "./orders/orders.controller";

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
    SellerController,
    OrdersController,
    VideosController,
  ],
  providers: [
    Db,
    AuthService,
    AuthGuard,
    ProfilesService,
    FeedService,
    EventsService,
    CommerceService,
    MeiliService,
    VideosService,
    StreamService,
    ModerationService,
    ProductsService,
    SellerService,
    LiveService,
    LiveChatService,
    HostBrainService,
    PaymentsService,
    WalletService,
    // The payment gateway is bound by PORT, not by vendor. Swapping providers
    // is a one-line change here and nowhere else.
    { provide: "PAYMENT_GATEWAY", useClass: LeanXGateway },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
