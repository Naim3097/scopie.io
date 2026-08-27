import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { LiveService } from "./live.service";

const TokenBody = z.object({
  roomId: z.string().min(1).max(64),
});

@Controller("v1/live")
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}

  @Get("rooms")
  async rooms() {
    return this.live.listRooms();
  }

  @Get("rooms/:id")
  async room(@Param("id") id: string) {
    const room = await this.live.getRoom(id);
    if (!room) throw new NotFoundException("room not found");
    return room;
  }

  @Post("token")
  async token(@Body() body: unknown) {
    const parsed = TokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!this.live.livekitConfigured) {
      // Demo mode: the web app falls back to a looping HLS preview.
      return { demo: true, token: null, url: null };
    }
    try {
      const { token, identity } = await this.live.viewerToken(parsed.data.roomId);
      return { demo: false, token, identity, url: process.env.LIVEKIT_URL ?? null };
    } catch {
      throw new NotFoundException("room is not live");
    }
  }
}
