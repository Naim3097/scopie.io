import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
// Root .env wins; a package-local .env only fills unset variables.
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv();

import { Worker } from "bullmq";
import { Pool } from "pg";
import { EngagementEvent } from "@scopie/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scopie worker process. MVP jobs:
 *  1. engagement-events: maintain denormalized video_stats counters
 *     (clients never write counters; only this worker does).
 *  2. (next) moderation scans, notification fan-out, payout batches.
 * Payment reconciliation + escrow auto-release run in the API process
 * (PaymentsService, 60s loop) where the gateway adapter lives.
 *
 * Phase 2: multi-step AI/video pipelines move to Temporal; single-step jobs
 * stay here on BullMQ.
 */

const redisUrl = process.env.REDIS_URL;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;
// An idle-client error (DB restart, pooler recycle) emits 'error' on the
// Pool; without a listener that is an uncaughtException that kills the worker.
pool?.on("error", (err) => console.error(`worker pg pool error: ${err.message}`));

if (!redisUrl) {
  console.log("worker: REDIS_URL not set — nothing to do (demo mode). Exiting.");
  process.exit(0);
}

const eventsWorker = new Worker(
  "engagement-events",
  async (job) => {
    const parsed = EngagementEvent.safeParse(job.data);
    if (!parsed.success) return; // never crash the queue on a bad payload
    const e = parsed.data;
    if (!pool) return;
    // Demo-mode subjects ("v1", "p_luxe_bag") are not uuids — skip counter
    // writes rather than failing every job against uuid-typed columns.
    if (!UUID_RE.test(e.subjectId)) return;

    switch (e.type) {
      case "video.view":
        await pool.query(
          `insert into video_stats (video_id, views) values ($1, 1)
           on conflict (video_id) do update set views = video_stats.views + 1`,
          [e.subjectId],
        );
        break;
      case "video.watch":
      case "video.complete":
        if (e.watchMs) {
          await pool.query(
            `insert into video_stats (video_id, watch_ms_total) values ($1, $2)
             on conflict (video_id) do update set watch_ms_total = video_stats.watch_ms_total + $2`,
            [e.subjectId, e.watchMs],
          );
        }
        break;
      case "video.like":
        await pool.query(
          `insert into video_stats (video_id, likes) values ($1, 1)
           on conflict (video_id) do update set likes = video_stats.likes + 1`,
          [e.subjectId],
        );
        break;
      case "video.unlike":
        await pool.query(`update video_stats set likes = greatest(likes - 1, 0) where video_id = $1`, [e.subjectId]);
        break;
      case "video.share":
        await pool.query(
          `insert into video_stats (video_id, shares) values ($1, 1)
           on conflict (video_id) do update set shares = video_stats.shares + 1`,
          [e.subjectId],
        );
        break;
      default:
        break; // other event types feed the recommender, not counters
    }
  },
  { connection: { url: redisUrl }, concurrency: 8 },
);

eventsWorker.on("failed", (job, err) => {
  console.error(`event job ${job?.id} failed: ${err.message}`);
});
eventsWorker.on("error", (err) => {
  // Redis connection errors surface here; logging keeps the process alive.
  console.error(`events worker error: ${err.message}`);
});

// Payment reconciliation lives in the API process itself
// (PaymentsService.reconcilePending, 60s loop, armed when DB + gateway are
// configured) — the gateway adapter and order logic are there.

console.log("Scopie worker running: engagement-events");
