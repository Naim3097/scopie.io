import { Injectable } from "@nestjs/common";
import type { Video } from "@scopie/core";
import { demoVideos } from "../demo/demo-data";

/**
 * Phase-0 feed: engagement-count heuristic over the demo set. Recency decay
 * and follow boost land with the Postgres-backed feed; phase 1 swaps the
 * source for Gorse/Recombee recall — the API contract stays identical.
 */
@Injectable()
export class FeedService {
  async getFeed(_userId: string | null, limit: number): Promise<Video[]> {
    // TODO(phase 1): pull candidates from Postgres + Gorse, boost follows,
    // filter moderation_state='approved'. Demo mode ranks the sample set.
    const scored = demoVideos
      .map((v) => {
        const likes = v.stats.likes ?? 0;
        const shares = v.stats.shares ?? 0;
        const comments = v.stats.comments ?? 0;
        return { v, score: likes + 2 * comments + 3 * shares };
      })
      .sort((a, b) => b.score - a.score)
      .map((s) => s.v);
    return scored.slice(0, limit);
  }
}
