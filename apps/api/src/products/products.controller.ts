import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ProductsService } from "./products.service";

const AddToCart = z.object({
  buyerId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
});

@Controller("v1")
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get("products/search")
  async search(@Query("q") q?: string, @Query("limit") limit?: string) {
    const n = Math.min(Math.max(Number(limit ?? 8) || 8, 1), 20);
    return this.products.search(q ?? "", n);
  }

  @Get("products/picks")
  async picks(@Query("limit") limit?: string) {
    const n = Math.min(Math.max(Number(limit ?? 8) || 8, 1), 20);
    return this.products.listPicks(n);
  }

  @Get("products/:id")
  async byId(@Param("id") id: string) {
    const product = await this.products.getById(id);
    if (!product) throw new NotFoundException("product not found");
    return product;
  }

  @Post("cart/items")
  addToCart(@Body() body: unknown) {
    const parsed = AddToCart.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { buyerId, productId, quantity } = parsed.data;
    return { items: this.products.addToCart(buyerId, productId, quantity) };
  }

  @Get("cart")
  getCart(@Query("buyerId") buyerId?: string) {
    if (!buyerId) throw new BadRequestException("buyerId required");
    return { items: this.products.getCart(buyerId) };
  }
}
