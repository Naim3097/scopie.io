import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { VideosService } from "./videos.service";
import { StreamService } from "./stream.service";
import { AuthGuard, CurrentUser } from "../auth/auth.guard";
import type { AuthedUser } from "../auth/auth.service";

const CreateUploadBody = z.object({
  caption: z.string().max(500).default(""),
});

@Controller("v1/videos")
export class VideosController {
  constructor(
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(StreamService) private readonly stream: StreamService,
  ) {}

  /** Start an upload: returns a direct-to-Cloudflare URL (or demo-publishes). */
  @Post("uploads")
  @UseGuards(AuthGuard)
  async createUpload(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const parsed = CreateUploadBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.videos.createUpload(user, parsed.data.caption);
  }

  /** Creator's own uploads with pipeline status. */
  @Get("mine")
  @UseGuards(AuthGuard)
  async mine(@CurrentUser() user: AuthedUser) {
    return { videos: await this.videos.listMine(user) };
  }

  /** Cloudflare Stream webhook — signature-verified; forgeries rejected. */
  @Post("webhook/stream")
  async streamWebhook(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException("missing raw body");
    const signature = req.headers["webhook-signature"];
    if (!this.stream.verifyWebhook(raw, typeof signature === "string" ? signature : undefined)) {
      throw new ForbiddenException("invalid signature");
    }
    const payload = JSON.parse(raw.toString("utf8")) as Parameters<VideosService["handleStreamReady"]>[0];
    await this.videos.handleStreamReady(payload);
    return { ok: true };
  }
}
