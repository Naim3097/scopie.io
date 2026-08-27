import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { ProductsService } from "./products.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

const AddToCart = z.object({
  // Identity comes from the auth token — never from the body.
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
  @UseGuards(AuthGuard)
  addToCart(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = AddToCart.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { productId, quantity } = parsed.data;
    return { items: this.products.addToCart(user.id, productId, quantity) };
  }

  @Get("cart")
  @UseGuards(AuthGuard)
  getCart(@CurrentUser() user: AuthedUser) {
    return { items: this.products.getCart(user.id) };
  }
}
