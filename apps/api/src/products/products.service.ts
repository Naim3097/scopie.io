import { Inject, Injectable } from "@nestjs/common";
import type { Product } from "@scopie/core";
import { CommerceService } from "../commerce/commerce.service";
import { BoundedMap } from "../util/bounded-map";

interface CartItem {
  productId: string;
  quantity: number;
}

/**
 * Product read model + cart. Catalog reads delegate to CommerceService
 * (Medusa → Postgres catalog → demo, in priority order); this class keeps the
 * cart, which is per-identity and bounded.
 */
@Injectable()
export class ProductsService {
  /** Bounded: unauthenticated callers must not be able to OOM the process. */
  private carts = new BoundedMap<string, CartItem[]>(5000);

  constructor(@Inject(CommerceService) private readonly commerce: CommerceService) {}

  async search(query: string, limit: number): Promise<Product[]> {
    return this.commerce.search(query, limit);
  }

  async getById(id: string): Promise<Product | null> {
    return this.commerce.getById(id);
  }

  async listPicks(limit: number): Promise<Product[]> {
    return this.commerce.listPicks(limit);
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
