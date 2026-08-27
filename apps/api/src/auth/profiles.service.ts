import { Inject, Injectable, Logger } from "@nestjs/common";
import { Db } from "../db";
import type { AuthedUser } from "./auth.service";

/**
 * Auto-provisions a profiles row for authenticated users. On Supabase the
 * auth trigger (packages/db/migrations/0003_supabase_auth.sql) does this at
 * signup; this service is the belt-and-braces path for rows created before
 * the trigger existed and for non-Supabase Postgres in development.
 */
@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);
  /** Per-process memo — ensure() runs on hot paths (checkout). */
  private readonly known = new Set<string>();

  constructor(@Inject(Db) private readonly db: Db) {}

  async ensure(user: AuthedUser): Promise<void> {
    if (user.isGuest || this.known.has(user.id)) return;
    const pool = this.db.get();
    if (!pool) return;
    const base = `user_${user.id.replace(/-/g, "").slice(0, 12)}`;
    const displayName = (user.email ? user.email.split("@")[0]! : "Scopie user").slice(0, 60);
    // `handle` is uniquely constrained separately from id; a 23505 on handle
    // must never surface as a checkout 500 (createCheckout only maps 23503).
    for (let attempt = 0; attempt <= 5; attempt++) {
      const handle = attempt === 0 ? base : `${base}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        await pool.query(
          `insert into profiles (id, handle, display_name)
           values ($1, $2, $3)
           on conflict (id) do nothing`,
          [user.id, handle, displayName],
        );
        break;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          // Handle clash → retry with a suffix; id clash means already provisioned.
          const exists = await pool.query(`select 1 from profiles where id=$1`, [user.id]);
          if ((exists.rowCount ?? 0) > 0) break;
          continue;
        }
        throw err;
      }
    }
    if (this.known.size > 10_000) this.known.clear();
    this.known.add(user.id);
  }
}
