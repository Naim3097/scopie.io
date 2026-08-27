import { Controller, Get, Inject, Query } from "@nestjs/common";
import { FeedService } from "./feed.service";

// Note: explicit @Inject everywhere — the dev runner (tsx/esbuild) does not
// emit design:paramtypes metadata, so implicit class injection fails there.
@Controller("v1/feed")
export class FeedController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}

  @Get()
  async getFeed(@Query("userId") userId?: string, @Query("limit") limit?: string) {
    const n = Math.min(Math.max(Number(limit ?? 10) || 10, 1), 50);
    return this.feed.getFeed(userId ?? null, n);
  }
}
