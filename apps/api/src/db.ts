import { Injectable, Logger } from "@nestjs/common";
import { Pool } from "pg";

/**
 * Lazy Postgres pool. Every service degrades gracefully when DATABASE_URL is
 * absent (demo mode) so the scaffold runs with zero infrastructure.
 */
@Injectable()
export class Db {
  private readonly logger = new Logger(Db.name);
  private pool: Pool | null = null;

  get available(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  get(): Pool | null {
    if (!this.available) return null;
    if (!this.pool) {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
      this.pool.on("error", (err) => this.logger.error(`pg pool error: ${err.message}`));
    }
    return this.pool;
  }
}
