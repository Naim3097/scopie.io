import { Injectable } from "@nestjs/common";
import { AccessToken } from "livekit-server-sdk";
import type { LiveRoom } from "@scopie/core";
import { demoLiveRooms } from "../demo/demo-data";

@Injectable()
export class LiveService {
  get livekitConfigured(): boolean {
    return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  }

  async listRooms(): Promise<LiveRoom[]> {
    // TODO: read live_rooms table when Postgres is configured.
    return demoLiveRooms;
  }

  async getRoom(roomId: string): Promise<LiveRoom | null> {
    return demoLiveRooms.find((r) => r.id === roomId) ?? null;
  }

  /**
   * Viewer token: subscribe-only. Publisher tokens (seller Live Studio) are a
   * separate authenticated path with role checks — never this endpoint.
   */
  async viewerToken(roomId: string, identity: string): Promise<string> {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: roomId, canPublish: false, canSubscribe: true, canPublishData: true });
    return at.toJwt();
  }
}
