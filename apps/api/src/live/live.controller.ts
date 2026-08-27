import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { LiveService } from "./live.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

const TokenBody = z.object({ roomId: z.string().min(1).max(64) });
const CreateRoomBody = z.object({ title: z.string().max(120).default("") });
const PinBody = z.object({ productId: z.string().min(1).max(64).nullable() });

@Controller("v1/live")
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}

  /** Whether real broadcasting is available — the studio labels itself honestly with this. */
  @Get("config")
  config() {
    return { livekit: this.live.livekitConfigured };
  }

  @Get("rooms")
  async rooms() {
    return this.live.listRooms();
  }

  /** The caller's own live room, if any — lets the studio recover from an orphaned stream. */
  @Get("mine")
  @UseGuards(AuthGuard)
  async mine(@CurrentUser() user: AuthedUser) {
    const room = await this.live.myLiveRoom(user);
    return { room: room ? { id: room.id, title: room.title, status: room.status } : null };
  }

  /** Room + server-resolved pinned product — clients never guess products. */
  @Get("rooms/:id")
  async room(@Param("id") id: string) {
    const view = await this.live.getRoomView(id);
    if (!view) throw new NotFoundException("room not found");
    return view;
  }

  /** Sellers go live. Tighter throttle than the global one: room churn is the demo DoS vector. */
  @Post("rooms")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(AuthGuard)
  async createRoom(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = CreateRoomBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const room = await this.live.createRoom(user, parsed.data.title);
    // Publisher credentials ride along so the studio connects in one round trip.
    if (this.live.livekitConfigured && this.live.isRealRoomId(room.id)) {
      const publisher = await this.live.publisherToken(user, room.id);
      return { room, publisher: { demo: false, url: process.env.LIVEKIT_URL ?? null, ...publisher } };
    }
    return { room, publisher: { demo: true, url: null, token: null } };
  }

  @Post("rooms/:id/end")
  @UseGuards(AuthGuard)
  async endRoom(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    await this.live.endRoom(user, id);
    return { ok: true };
  }

  @Post("rooms/:id/pin")
  @UseGuards(AuthGuard)
  async pin(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = PinBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.live.pinProduct(user, id, parsed.data.productId);
    return { ok: true };
  }

  @Post("token")
  async token(@Body() body: unknown) {
    const parsed = TokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    // Real LiveKit tokens only for rooms that can actually have a publisher
    // (DB rooms). Showcase/demo ids would "connect" to an auto-created empty
    // room and freeze viewers on a poster — the HLS preview is honest instead.
    if (!this.live.livekitConfigured || !this.live.isRealRoomId(parsed.data.roomId)) {
      return { demo: true, token: null, url: null };
    }
    try {
      const { token, identity, livekitRoom } = await this.live.viewerToken(parsed.data.roomId);
      return { demo: false, token, identity, livekitRoom, url: process.env.LIVEKIT_URL ?? null };
    } catch {
      throw new NotFoundException("room is not live");
    }
  }
}
