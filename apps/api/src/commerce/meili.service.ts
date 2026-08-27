import { Injectable, Logger } from "@nestjs/common";
import type { Product } from "@scopie/core";

/**
 * Meilisearch integration. Search is the source of record for the search bar
 * and the shopper agent's product tool when MEILI_HOST is configured; every
 * catalog write (re)indexes here. Absent config → null so callers fall back.
 */
@Injectable()
export class MeiliService {
  private readonly logger = new Logger(MeiliService.name);
  private readonly indexName = "products";

  get configured(): boolean {
    return Boolean(process.env.MEILI_HOST);
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(process.env.MEILI_API_KEY ? { authorization: `Bearer ${process.env.MEILI_API_KEY}` } : {}),
    };
  }

  /** Returns hits, or null when Meili is not configured / unreachable. */
  async search(query: string, limit: number): Promise<Product[] | null> {
    if (!this.configured) return null;
    try {
      const res = await fetch(`${process.env.MEILI_HOST}/indexes/${this.indexName}/search`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ q: query, limit }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { hits: Product[] };
      return json.hits;
    } catch {
      return null;
    }
  }

  async index(products: Product[]): Promise<void> {
    if (!this.configured || products.length === 0) return;
    try {
      await fetch(`${process.env.MEILI_HOST}/indexes/${this.indexName}/documents?primaryKey=id`, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify(products),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.warn(`meili index failed: ${(err as Error).message}`);
    }
  }

  /** Purge documents — called when products are archived/deleted so search never serves ghosts. */
  async remove(ids: string[]): Promise<void> {
    if (!this.configured || ids.length === 0) return;
    try {
      await fetch(`${process.env.MEILI_HOST}/indexes/${this.indexName}/documents/delete-batch`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(ids),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.warn(`meili remove failed: ${(err as Error).message}`);
    }
  }
}
