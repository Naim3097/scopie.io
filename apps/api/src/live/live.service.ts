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
   * Viewer token: subscribe-only, for EXISTING live rooms only (LiveKit
   * auto-creates rooms on join — an open mint endpoint would let anyone
   * create rooms on our project). Identity is server-generated so a caller
   * can't evict another viewer by reusing their identity. No data publish:
   * chat goes through the API, not the room's data channel.
   * Publisher tokens (seller Live Studio) are a separate authenticated path.
   */
  async viewerToken(roomId: string): Promise<{ token: string; identity: string }> {
    const room = await this.getRoom(roomId);
    if (!room || room.status !== "live") {
      throw new Error("room is not live");
    }
    const identity = `viewer-${crypto.randomUUID().slice(0, 12)}`;
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: roomId, canPublish: false, canSubscribe: true, canPublishData: false });
    return { token: await at.toJwt(), identity };
  }
}
