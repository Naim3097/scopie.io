import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { EngagementEventBatch, type EngagementEventType } from "@scopie/core";
import { EventsService } from "./events.service";

/**
 * Event types clients may never submit — they are written server-side where
 * the underlying fact is actually verified (e.g. purchase on payment
 * confirmation). Client-submitted ones are dropped, not errored, so a
 * tampered batch can't discover the boundary by probing.
 */
const SERVER_ONLY_EVENTS: ReadonlySet<EngagementEventType> = new Set(["product.purchase"] as const);

@Controller("v1/events")
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

  @Post()
  async ingest(@Body() body: unknown) {
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
    const accepted = parsed.data.events.filter((e) => !SERVER_ONLY_EVENTS.has(e.type));
    if (accepted.length === 0) return { accepted: 0 };
    return this.events.ingest(accepted);
  }
}
