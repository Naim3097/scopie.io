import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Product } from "@scopie/core";
import { Db } from "../db";
import { demoProducts } from "../demo/demo-data";
import { MeiliService } from "./meili.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NewProductInput {
  title: string;
  variant?: string;
  priceSen: number;
  imageUrl?: string;
  tags: string[];
  stock?: number;
}

/**
 * Catalog read/write across three sources, in priority order:
 *   1. Medusa+Mercur (MEDUSA_URL set) — the marketplace system of record.
 *   2. Postgres catalog_products (DATABASE_URL set) — authoritative in DB mode,
 *      a read cache in Medusa mode.
 *   3. The demo array — zero-infrastructure fallback.
 *
 * Seller writes go to Medusa when configured, else to Postgres, else to a
 * bounded in-memory demo store; every write also (re)indexes Meilisearch.
 */
@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  /** Demo-mode seller-authored products (no DB). Reset on restart. */
  private demoAuthored: Product[] = [];

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(MeiliService) private readonly meili: MeiliService,
  ) {}

  private get medusaUrl(): string | undefined {
    return process.env.MEDUSA_URL;
  }

  private rowToProduct(r: Record<string, unknown>): Product {
    return {
      id: String(r.id),
      sellerId: String(r.seller_id),
      title: String(r.title),
      variant: (r.variant as string) ?? undefined,
      priceSen: Number(r.price_sen),
      imageUrl: (r.image_url as string) ?? undefined,
      matchScore: r.match_score != null ? Number(r.match_score) : undefined,
      tags: (r.tags as string[]) ?? [],
    };
  }

  /** True when a real catalog source exists — the demo array must then never leak into results. */
  private get realSourceConfigured(): boolean {
    return Boolean(this.medusaUrl) || this.db.available;
  }

  async listPicks(limit: number): Promise<Product[]> {
    if (this.medusaUrl) {
      const products = await this.fromMedusa(`/store/products?limit=${limit}`);
      if (products) return products;
      // Configured-but-errored: degrade to the DB cache only, never to demo.
      this.logger.warn("Medusa unreachable — serving the catalog cache");
    }
    const pool = this.db.get();
    if (pool) {
      const res = await pool.query(
        `select * from catalog_products where status='active'
         order by match_score desc nulls last, created_at desc limit $1`,
        [limit],
      );
      return res.rows.map((r) => this.rowToProduct(r));
    }
    const all = [...demoProducts, ...this.demoAuthored];
    return all.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, limit);
  }

  async getById(id: string): Promise<Product | null> {
    if (this.medusaUrl) {
      const products = await this.fromMedusa(`/store/products/${encodeURIComponent(id)}`);
      if (products && products[0]) return products[0];
    }
    const pool = this.db.get();
    if (pool) {
      // Only ACTIVE products resolve — an archived/draft product must not be
      // buyable by anyone still holding its id (shared links, stale search).
      const res = await pool.query(`select * from catalog_products where id=$1 and status='active'`, [id]);
      if (res.rows[0]) return this.rowToProduct(res.rows[0]);
    }
    // Demo products exist ONLY when no real catalog source is configured —
    // otherwise phantom items with fabricated prices would enter real stores.
    if (this.realSourceConfigured) return null;
    return [...demoProducts, ...this.demoAuthored].find((p) => p.id === id) ?? null;
  }

  async search(query: string, limit: number): Promise<Product[]> {
    // Meilisearch is the search source of record when configured.
    const viaMeili = await this.meili.search(query, limit);
    if (viaMeili) return viaMeili;

    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];
    const pool = this.db.get();
    if (pool) {
      // Every word matches title OR any tag overlaps; escape LIKE wildcards.
      const patterns = words.map((w) => `%${w.replace(/[%_\\]/g, "\\$&")}%`);
      const res = await pool.query(
        `select * from catalog_products where status='active'
           and (title ilike any($1) or $2 && tags)
         limit $3`,
        [patterns, words, limit],
      );
      return res.rows.map((r) => this.rowToProduct(r));
    }
    if (this.realSourceConfigured) return [];
    return [...demoProducts, ...this.demoAuthored]
      .filter((p) =>
        words.some(
          (w) =>
            p.title.toLowerCase().includes(w) ||
            (p.variant ?? "").toLowerCase().includes(w) ||
            p.tags.some((t) => t.includes(w) || w.includes(t)),
        ),
      )
      .slice(0, limit);
  }

  async createProduct(sellerId: string, input: NewProductInput): Promise<Product> {
    const id = `prod_${randomUUID().slice(0, 12)}`;
    const product: Product = {
      id,
      sellerId,
      title: input.title,
      variant: input.variant,
      priceSen: input.priceSen,
      imageUrl: input.imageUrl,
      tags: input.tags,
    };

    if (this.medusaUrl) {
      // TODO: POST to the Mercur vendor API. Until wired, fall through to DB/demo.
      this.logger.warn("MEDUSA_URL set but vendor product creation is not wired yet");
    }
    // Basic invariants held at the service too, not only the controller zod
    // layer — no caller may create free/oversized products.
    if (!Number.isInteger(input.priceSen) || input.priceSen < 1) throw new Error("invalid price");
    if (input.title.trim().length < 1 || input.title.length > 140) throw new Error("invalid title");
    const pool = this.db.get();
    // Guest seller ids ('guest:x') must never hit the uuid column.
    if (pool && UUID_RE.test(sellerId)) {
      await pool.query(
        `insert into catalog_products (id, seller_id, title, variant, price_sen, image_url, tags, stock)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, sellerId, input.title, input.variant ?? null, input.priceSen, input.imageUrl ?? null, input.tags, input.stock ?? 100],
      );
    } else {
      this.demoAuthored.push(product);
      if (this.demoAuthored.length > 1000) this.demoAuthored.shift();
    }
    void this.meili.index([product]);
    return product;
  }

  async listSellerProducts(sellerId: string): Promise<Product[]> {
    const pool = this.db.get();
    if (pool && UUID_RE.test(sellerId)) {
      const res = await pool.query(
        `select * from catalog_products where seller_id=$1 order by created_at desc`,
        [sellerId],
      );
      return res.rows.map((r) => this.rowToProduct(r));
    }
    return this.demoAuthored.filter((p) => p.sellerId === sellerId);
  }

  /** Full reindex into Meilisearch. No scheduled caller yet — an ops/worker hook when archiving lands. */
  async reindexAll(): Promise<number> {
    const pool = this.db.get();
    let products: Product[];
    if (pool) {
      const res = await pool.query(`select * from catalog_products where status='active'`);
      products = res.rows.map((r) => this.rowToProduct(r));
    } else {
      products = [...demoProducts, ...this.demoAuthored];
    }
    await this.meili.index(products);
    return products.length;
  }

  private async fromMedusa(path: string): Promise<Product[] | null> {
    try {
      const res = await fetch(`${this.medusaUrl}${path}`, {
        headers: process.env.MEDUSA_PUBLISHABLE_KEY
          ? { "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY }
          : {},
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 404) return []; // real not-found, not an outage
      if (!res.ok) {
        this.logger.warn(`Medusa returned ${res.status} on ${path}`);
        return null;
      }
      const json = (await res.json()) as { products?: unknown[]; product?: unknown };
      const raw = json.products ?? (json.product ? [json.product] : []);
      return raw
        .map((p) => this.medusaToProduct(p as Record<string, unknown>))
        .filter((p): p is Product => p !== null);
    } catch (err) {
      this.logger.warn(`Medusa unreachable on ${path}: ${(err as Error).message}`);
      return null; // caller degrades to the DB cache — never to demo
    }
  }

  /**
   * Maps a Medusa v2 store product to Scopie's Product shape.
   * v2 money is MAJOR-unit decimal via variant.calculated_price — convert to
   * sen. A product whose price can't be resolved is SKIPPED (returning it as
   * free would charge buyers RM0 and reconcile "cleanly" against itself).
   */
  private medusaToProduct(p: Record<string, unknown>): Product | null {
    const variants = (p.variants as Array<Record<string, unknown>>) ?? [];
    const first = variants[0];
    const calc = first?.calculated_price as Record<string, unknown> | undefined;
    let priceSen = 0;
    if (calc && typeof calc.calculated_amount === "number") {
      const currency = String(calc.currency_code ?? "").toLowerCase();
      if (currency && currency !== "myr") {
        this.logger.warn(`Medusa product ${String(p.id)} priced in ${currency}, not MYR — skipped`);
        return null;
      }
      priceSen = Math.round(calc.calculated_amount * 100);
    } else {
      // v1-style prices[] fallback (already minor units) — best effort.
      const prices = (first?.prices as Array<Record<string, unknown>>) ?? [];
      const myr = prices.find((pr) => pr.currency_code === "myr") ?? prices[0];
      if (myr) priceSen = Number(myr.amount);
    }
    if (!Number.isInteger(priceSen) || priceSen < 1) {
      this.logger.warn(`Medusa product ${String(p.id)} has no resolvable price — skipped`);
      return null;
    }
    return {
      id: String(p.id),
      sellerId: String((p.metadata as Record<string, unknown>)?.seller_id ?? "unknown"),
      title: String(p.title ?? ""),
      variant: first ? String(first.title ?? "") : undefined,
      priceSen,
      imageUrl: (p.thumbnail as string) ?? undefined,
      tags: ((p.tags as Array<{ value: string }>) ?? []).map((t) => t.value),
    };
  }
}
