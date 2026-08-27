import { BadRequestException, Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { SellerService } from "./seller.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

const OnboardBody = z.object({ shopName: z.string().min(2).max(80) });
const NewProduct = z.object({
  title: z.string().min(1).max(140),
  variant: z.string().max(80).optional(),
  priceSen: z.number().int().min(1).max(1_000_000_00),
  // http(s) only — zod's .url() alone would admit javascript:/data: schemes.
  imageUrl: z.string().url().max(2048).regex(/^https?:\/\//).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  stock: z.number().int().min(0).max(1_000_000).optional(),
});
const ShipBody = z.object({ trackingRef: z.string().max(120).optional() });

/** Seller Centre API — every route is the authenticated seller's own scope. */
@Controller("v1/seller")
@UseGuards(AuthGuard)
export class SellerController {
  constructor(@Inject(SellerService) private readonly seller: SellerService) {}

  @Get("me")
  async me(@CurrentUser() user: AuthedUser) {
    const seller = await this.seller.getSeller(user);
    return { seller };
  }

  @Post("onboard")
  async onboard(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = OnboardBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return { seller: await this.seller.onboard(user, parsed.data.shopName) };
  }

  @Get("products")
  async products(@CurrentUser() user: AuthedUser) {
    return { products: await this.seller.myProducts(user) };
  }

  @Post("products")
  async addProduct(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = NewProduct.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return { product: await this.seller.addProduct(user, parsed.data) };
  }

  @Get("orders")
  async orders(@CurrentUser() user: AuthedUser) {
    return { orders: await this.seller.myOrders(user) };
  }

  @Get("balance")
  async balance(@CurrentUser() user: AuthedUser) {
    return { payableSen: await this.seller.myBalanceSen(user) };
  }

  @Post("orders/:orderId/ship")
  async ship(@Param("orderId") orderId: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    if (!z.string().uuid().safeParse(orderId).success) throw new BadRequestException("invalid order id");
    const parsed = ShipBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.seller.shipOrder(user, orderId, parsed.data.trackingRef);
  }
}
