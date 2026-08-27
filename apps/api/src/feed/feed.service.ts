import { Inject, Injectable } from "@nestjs/common";
import type { Video } from "@scopie/core";
import { demoVideos } from "../demo/demo-data";
import { VideosService } from "../videos/videos.service";

/**
 * Feed sources, in priority order:
 *  - DB mode: ready + approved creator uploads, ranked by recency-decayed
 *    engagement (SQL in VideosService.listFeed). Falls back to the demo set
 *    only while the real catalog is EMPTY — a store with content never mixes
 *    demo clips in.
 *  - Demo mode: the sample set plus demo-published creator videos (newest
 *    first), ranked by the engagement-count heuristic.
 * Phase 1 recommender (Gorse/Recombee) swaps the source; the contract stays.
 */
@Injectable()
export class FeedService {
  constructor(@Inject(VideosService) private readonly videos: VideosService) {}

  async getFeed(_userId: string | null, limit: number): Promise<Video[]> {
    const dbFeed = await this.videos.listFeed(limit);
    if (dbFeed !== null) {
      if (dbFeed.length > 0) return dbFeed;
      // Cold-start fallback for a configured-but-empty store: sample videos
      // keep the feed alive, but with productIds STRIPPED — demo products
      // don't exist in a real catalog, and a buy surface that 404s (or
      // phantom prices) is exactly what the commerce demo-leak rule forbids.
      return demoVideos.map((v) => ({ ...v, productIds: [] })).slice(0, limit);
    }

    const authored = this.videos.listDemoAuthored(5);
    const scored = demoVideos
      .map((v) => {
        const likes = v.stats.likes ?? 0;
        const shares = v.stats.shares ?? 0;
        const comments = v.stats.comments ?? 0;
        return { v, score: likes + 2 * comments + 3 * shares };
      })
      .sort((a, b) => b.score - a.score)
      .map((s) => s.v);
    // Fresh creator posts lead the demo feed — "my upload appeared" is the
    // moment the create flow demonstrates.
    return [...authored, ...scored].slice(0, limit);
  }
}
