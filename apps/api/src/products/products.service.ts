import { Injectable } from "@nestjs/common";
import type { Product } from "@scopie/core";
import { demoProducts } from "../demo/demo-data";
import { BoundedMap } from "../util/bounded-map";

interface CartItem {
  productId: string;
  quantity: number;
}

/**
 * Product read model + cart stub.
 * System of record for catalog/orders is Medusa+Mercur (apps/commerce);
 * search is served by Meilisearch when configured. Demo mode filters the
 * sample catalog so the app and agents work with zero infrastructure.
 */
@Injectable()
export class ProductsService {
  /** Bounded: unauthenticated callers must not be able to OOM the process. */
  private carts = new BoundedMap<string, CartItem[]>(5000);

  async search(query: string, limit: number): Promise<Product[]> {
    if (process.env.MEILI_HOST) {
      try {
        const res = await fetch(`${process.env.MEILI_HOST}/indexes/products/search`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(process.env.MEILI_API_KEY ? { authorization: `Bearer ${process.env.MEILI_API_KEY}` } : {}),
          },
          body: JSON.stringify({ q: query, limit }),
          signal: AbortSignal.timeout(3000), // a slow Meili degrades to demo, never hangs the request
        });
        if (res.ok) {
          const json = (await res.json()) as { hits: Product[] };
          return json.hits;
        }
      } catch {
        // fall through to the demo catalog
      }
    }
    // Word-level match: "running shoes" finds the runner instead of nothing.
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return [];
    return demoProducts
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

  async getById(id: string): Promise<Product | null> {
    // TODO: fetch from Medusa (MEDUSA_URL) when configured.
    return demoProducts.find((p) => p.id === id) ?? null;
  }

  async listPicks(limit: number): Promise<Product[]> {
    return [...demoProducts].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, limit);
  }

  addToCart(buyerId: string, productId: string, quantity: number): CartItem[] {
    const cart = this.carts.get(buyerId) ?? [];
    const existing = cart.find((i) => i.productId === productId);
    if (existing) existing.quantity += quantity;
    else cart.push({ productId, quantity });
    this.carts.set(buyerId, cart);
    return cart;
  }

  getCart(buyerId: string): CartItem[] {
    return this.carts.get(buyerId) ?? [];
  }
}
