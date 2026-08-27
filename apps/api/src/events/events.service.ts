import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import type { EngagementEvent } from "@scopie/core";
import { Db } from "../db";

/**
 * Append-only event ingestion. Events are written to Postgres (authoritative)
 * and enqueued for the worker (counters, recommender feed). Both sinks are
 * optional in demo mode.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private queue: Queue | null = null;

  constructor(@Inject(Db) private readonly db: Db) {
    if (process.env.REDIS_URL) {
      this.queue = new Queue("engagement-events", {
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: {
          // The highest-volume stream in the product — never let completed
          // jobs accumulate in Redis.
          removeOnComplete: { age: 3600, count: 10_000 },
          removeOnFail: { age: 86_400 },
        },
      });
    }
  }

  async ingest(events: EngagementEvent[]): Promise<{ accepted: number }> {
    const pool = this.db.get();
    if (pool) {
      const text =
        "insert into engagement_events (event_type, user_id, subject_id, watch_ms, duration_ms, surface, client_ts, meta) values ($1,$2,$3,$4,$5,$6,$7,$8)";
      for (const e of events) {
        await pool.query(text, [
          e.type,
          e.userId,
          e.subjectId,
          e.watchMs ?? null,
          e.durationMs ?? null,
          e.surface,
          e.ts ?? null,
          e.meta ? JSON.stringify(e.meta) : null,
        ]);
      }
    } else {
      this.logger.debug(`demo mode: ${events.length} events (not persisted)`);
    }
    if (this.queue) {
      await this.queue.addBulk(events.map((e) => ({ name: e.type, data: e })));
    }
    return { accepted: events.length };
  }
}
