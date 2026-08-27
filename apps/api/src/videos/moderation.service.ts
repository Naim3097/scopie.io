import { Inject, Injectable, Logger } from "@nestjs/common";
import { Db } from "../db";

/**
 * Video moderation pipeline (MVP scope: caption text; frame sampling lands
 * with a vision provider). Every decision writes a moderation_log row with a
 * prose reason — the MCMC-shaped audit trail is non-negotiable.
 *
 * Failure discipline (from the adversarial review — keep it):
 *  - The auto-approve fallback applies ONLY to moderation-PROVIDER failures.
 *    A DB write failure must propagate so the webhook 5xxs and the sweep
 *    re-drives — it must NEVER convert a flagged verdict into an approval.
 *  - apply() commits the state change and its audit row in ONE transaction.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(@Inject(Db) private readonly db: Db) {}

  async queueVideoModeration(videoId: string, caption: string): Promise<void> {
    let verdict: { flagged: boolean; reason: string };
    try {
      verdict = await this.moderateText(caption);
    } catch (err) {
      // Provider outage only: videos must not strand in 'pending', but the
      // fallback is explicit and logged.
      this.logger.error(`moderation provider failed for ${videoId}: ${(err as Error).message}`);
      verdict = { flagged: false, reason: "auto-approved: moderation provider unavailable (fallback policy)" };
    }
    // DB errors here PROPAGATE — the ready-webhook 5xxs and the sweep retries.
    await this.apply(videoId, verdict.flagged, verdict.reason);
  }

  /** Caption-only screening, reused by the demo publish path. */
  async moderateText(text: string): Promise<{ flagged: boolean; reason: string }> {
    if (!process.env.OPENAI_API_KEY) {
      return { flagged: false, reason: "auto-approved: no moderation provider configured (MVP fallback)" };
    }
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text || "(no caption)" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`moderation API ${res.status}`);
    const json = (await res.json()) as { results: Array<{ flagged: boolean; categories: Record<string, boolean> }> };
    const r = json.results[0];
    if (!r) throw new Error("empty moderation response");
    const cats = Object.entries(r.categories)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    return {
      flagged: r.flagged,
      reason: r.flagged ? `caption flagged by omni-moderation: ${cats}` : "caption passed omni-moderation",
    };
  }

  /** State change + audit row commit together or not at all. */
  private async apply(videoId: string, flagged: boolean, reason: string): Promise<void> {
    const pool = this.db.get();
    if (!pool) return;
    const state = flagged ? "flagged" : "approved";
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`update videos set moderation_state=$2 where id=$1`, [videoId, state]);
      await client.query(
        `insert into moderation_log (subject_type, subject_id, action, reason, actor)
         values ('video', $1, $2, $3, 'model:omni-moderation')`,
        [videoId, flagged ? "flagged" : "approved", reason],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
