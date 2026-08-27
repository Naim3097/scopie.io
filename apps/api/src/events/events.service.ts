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
      // A Redis blip emits 'error' on the queue; unhandled, it kills the process.
      this.queue.on("error", (err) => this.logger.error(`events queue error: ${err.message}`));
    }
  }

  async ingest(events: EngagementEvent[]): Promise<{ accepted: number }> {
    const pool = this.db.get();
    if (pool) {
      // One multi-row INSERT: atomic (no partially-persisted batches to
      // duplicate on client retry) and one round trip instead of N.
      const values: unknown[] = [];
      const rows = events
        .map((e, i) => {
          const base = i * 8;
          values.push(
            e.type,
            e.userId,
            e.subjectId,
            e.watchMs ?? null,
            e.durationMs ?? null,
            e.surface,
            e.ts ?? null,
            e.meta ? JSON.stringify(e.meta) : null,
          );
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
        })
        .join(",");
      await pool.query(
        `insert into engagement_events (event_type, user_id, subject_id, watch_ms, duration_ms, surface, client_ts, meta) values ${rows}`,
        values,
      );
    } else {
      this.logger.debug(`demo mode: ${events.length} events (not persisted)`);
    }
    if (this.queue) {
      await this.queue.addBulk(events.map((e) => ({ name: e.type, data: e })));
    }
    return { accepted: events.length };
  }
}
