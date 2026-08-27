import { Injectable } from "@nestjs/common";
import type { Product } from "@scopie/core";
import { demoProducts } from "../demo/demo-data";

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
  private carts = new Map<string, CartItem[]>();

  async search(query: string, limit: number): Promise<Product[]> {
    if (process.env.MEILI_HOST) {
      const res = await fetch(`${process.env.MEILI_HOST}/indexes/products/search`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.MEILI_API_KEY ? { authorization: `Bearer ${process.env.MEILI_API_KEY}` } : {}),
        },
        body: JSON.stringify({ q: query, limit }),
      });
      if (res.ok) {
        const json = (await res.json()) as { hits: Product[] };
        return json.hits;
      }
    }
    const q = query.toLowerCase();
    return demoProducts
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.variant ?? "").toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
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
