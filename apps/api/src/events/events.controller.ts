import { BadRequestException, Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { EngagementEventBatch, type EngagementEventType } from "@scopie/core";
import { EventsService } from "./events.service";
import { AuthService } from "../auth/auth.service";

/**
 * Event types clients may never submit — they are written server-side where
 * the underlying fact is actually verified (e.g. purchase on payment
 * confirmation). Client-submitted ones are dropped, not errored, so a
 * tampered batch can't discover the boundary by probing.
 */
const SERVER_ONLY_EVENTS: ReadonlySet<EngagementEventType> = new Set(["product.purchase"] as const);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("v1/events")
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post()
  async ingest(@Body() body: unknown, @Req() req: Request) {
    // sendBeacon batches arrive as text/plain (CORS-preflight-free); regular
    // fetches arrive as parsed JSON.
    let payload: unknown = body;
    if (typeof body === "string") {
      try {
        payload = JSON.parse(body);
      } catch {
        throw new BadRequestException("invalid JSON");
      }
    }
    const parsed = EngagementEventBatch.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    let accepted = parsed.data.events.filter((e) => !SERVER_ONLY_EVENTS.has(e.type));
    if (accepted.length === 0) return { accepted: 0 };
    const authed = this.auth.fromRequest(req);
    if (authed) {
      // A valid token overrides the (spoofable) client-supplied userId.
      accepted = accepted.map((e) => ({ ...e, userId: authed.id }));
    } else {
      // Token-less callers may only attribute events to anon/guest ids — a
      // raw uuid could poison a real user's recommender history.
      accepted = accepted.map((e) =>
        UUID_RE.test(e.userId) ? { ...e, userId: `anon:${e.userId}` } : e,
      );
    }
    return this.events.ingest(accepted);
  }
}
