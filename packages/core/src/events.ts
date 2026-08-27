import { z } from "zod";

/**
 * The append-only engagement event taxonomy.
 *
 * This is the single most load-bearing schema in Scopie: every recommender
 * option (heuristic feed, Gorse, Recombee, a future two-tower model) consumes
 * exactly this stream. Events are immutable — never update or delete rows.
 */
export const EngagementEventType = z.enum([
  "video.view", // impression: card became active in the feed
  "video.watch", // periodic + final watch progress (carries watch_ms)
  "video.complete", // watched to the end
  "video.skip", // swiped away before threshold
  "video.like",
  "video.unlike",
  "video.share",
  "video.comment",
  "profile.follow",
  "profile.unfollow",
  "product.view", // opened a product sheet
  "product.add_to_cart",
  "product.purchase", // written server-side on payment confirmation only
  "live.join",
  "live.leave",
  "live.chat",
  "live.pin_tap", // tapped the pinned product
  "search.query",
]);
export type EngagementEventType = z.infer<typeof EngagementEventType>;

export const EngagementEvent = z.object({
  type: EngagementEventType,
  /** Authenticated user id (uuid) or anonymous device id prefixed "anon:" */
  userId: z.string().min(1),
  /** Subject of the event: video id, product id, room id, profile id, or query string */
  subjectId: z.string().min(1),
  /** Milliseconds watched — only for video.watch / video.complete / video.skip */
  watchMs: z.number().int().nonnegative().optional(),
  /** Total duration of the video in ms, when known */
  durationMs: z.number().int().positive().optional(),
  /** Where it happened, for surface-level analysis */
  surface: z.enum(["feed", "discover", "live", "shop", "profile", "search"]).default("feed"),
  /** Client timestamp (server also stamps received_at authoritatively) */
  ts: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type EngagementEvent = z.infer<typeof EngagementEvent>;

export const EngagementEventBatch = z.object({
  events: z.array(EngagementEvent).min(1).max(100),
});
export type EngagementEventBatch = z.infer<typeof EngagementEventBatch>;
