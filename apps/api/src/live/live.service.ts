import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type { LiveRoom, Product } from "@scopie/core";
import { demoLiveRooms } from "../demo/demo-data";
import { Db } from "../db";
import { SellerService } from "../seller/seller.service";
import { CommerceService } from "../commerce/commerce.service";
import type { AuthedUser } from "../auth/auth.service";
import { BoundedMap } from "../util/bounded-map";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Refuse new demo rooms before the BoundedMap would evict someone's LIVE stream. */
const DEMO_LIVE_CAPACITY = 400;
/** No stream runs forever: rooms live longer than this are reaped as stale. */
const STALE_ROOM_MS = 12 * 60 * 60 * 1000;
/** Demo rooms turn over faster — a guest-id rotation attack must not hold capacity for hours. */
const DEMO_STALE_ROOM_MS = 2 * 60 * 60 * 1000;

interface OwnedRoom extends LiveRoom {
  hostId: string;
  startedAtMs?: number;
}

/**
 * Live rooms: DB-backed for real identities, bounded in-memory for demo.
 * Sellers create/end/pin; viewers get subscribe-only tokens for LIVE rooms.
 * Cold-start rule (same as the feed): a configured-but-empty DB shows the
 * demo showcase rooms with their pins STRIPPED — demo products must never
 * drive buy surfaces in a real store. Showcase/demo room ids are non-UUIDs,
 * so they never get real LiveKit tokens (no publisher can exist for them).
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly demoRooms = new BoundedMap<string, OwnedRoom>(500);
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(SellerService) private readonly seller: SellerService,
    @Inject(CommerceService) private readonly commerce: CommerceService,
  ) {}

  onModuleInit(): void {
    // Safety net for rooms orphaned by tab-closes and crashed studios: a
    // room "live" for 12h+ is stale — end it so its host isn't 409-locked
    // and viewers aren't shown a dead stream.
    this.reapTimer = setInterval(() => {
      void this.reapStaleRooms().catch((err: Error) => this.logger.error(`stale-room reap failed: ${err.message}`));
    }, 10 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.reapTimer) clearInterval(this.reapTimer);
  }

  get livekitConfigured(): boolean {
    // All three or nothing: key+secret without the URL would advertise real
    // broadcasting the studio can never actually connect to.
    return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  }

  /** Only DB rooms (UUID ids) can have a real publisher — demo/showcase ids never get real tokens. */
  isRealRoomId(roomId: string): boolean {
    return UUID_RE.test(roomId);
  }

  private isDbIdentity(user: AuthedUser): boolean {
    return this.db.available && !user.isGuest && UUID_RE.test(user.id);
  }

  private roomService(): RoomServiceClient | null {
    const url = process.env.LIVEKIT_URL;
    if (!url || !this.livekitConfigured) return null;
    const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  }

  /** Best-effort media-layer teardown: "end" must actually stop the stream, not just flip a status bit. */
  private async closeLivekitRoom(roomId: string): Promise<void> {
    const svc = this.roomService();
    if (!svc) return;
    try {
      await svc.deleteRoom(`room_${roomId}`);
    } catch (err) {
      this.logger.warn(`livekit room teardown failed for room_${roomId}: ${(err as Error).message}`);
    }
  }

  private rowToRoom(r: Record<string, unknown>): OwnedRoom {
    return {
      id: String(r.id),
      hostId: String(r.host_id ?? ""),
      title: String(r.title),
      hostType: (r.host_type as "seller" | "ai") ?? "seller",
      aiDisclosed: Boolean(r.ai_disclosed),
      status: (r.status as "scheduled" | "live" | "ended") ?? "live",
      viewerCount: 0, // real participant counts land with LiveKit server-API polling
      pinnedProductId: (r.pinned_product_id as string) ?? null,
      flashDeal: null,
    };
  }

  async listRooms(): Promise<LiveRoom[]> {
    const pool = this.db.get();
    if (pool) {
      const res = await pool.query(
        `select id, host_id, title, host_type, ai_disclosed, status, pinned_product_id
         from live_rooms where status='live' order by started_at desc nulls last limit 20`,
      );
      if ((res.rowCount ?? 0) > 0) return res.rows.map((r) => this.stripOwner(this.rowToRoom(r)));
      // Cold start: showcase rooms, pins stripped (demo products don't exist here).
      return demoLiveRooms.map((r) => ({ ...r, pinnedProductId: null, flashDeal: null }));
    }
    const mine = [...this.demoRooms.values()].filter((r) => r.status === "live").reverse();
    return [...mine, ...demoLiveRooms].map((r) => this.stripOwner(r as OwnedRoom));
  }

  private stripOwner(room: OwnedRoom | LiveRoom): LiveRoom {
    const { hostId: _hostId, startedAtMs: _startedAtMs, ...rest } = room as OwnedRoom;
    return rest;
  }

  async getRoom(roomId: string): Promise<OwnedRoom | null> {
    const pool = this.db.get();
    if (pool && UUID_RE.test(roomId)) {
      const res = await pool.query(
        `select id, host_id, title, host_type, ai_disclosed, status, pinned_product_id
         from live_rooms where id=$1`,
        [roomId],
      );
      if (res.rows[0]) return this.rowToRoom(res.rows[0]);
    }
    const demo = this.demoRooms.get(roomId);
    if (demo) return demo;
    const staticRoom = demoLiveRooms.find((r) => r.id === roomId);
    if (!staticRoom) return null;
    const stripPins = Boolean(pool); // DB mode: showcase pins stripped
    return {
      ...staticRoom,
      hostId: "demo",
      pinnedProductId: stripPins ? null : staticRoom.pinnedProductId,
      flashDeal: stripPins ? null : staticRoom.flashDeal,
    };
  }

  /** Room + its pinned product resolved server-side (never a client-side demo lookup in real mode). */
  async getRoomView(roomId: string): Promise<(LiveRoom & { pinnedProduct: Product | null }) | null> {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    const pinnedProduct = room.pinnedProductId ? await this.commerce.getById(room.pinnedProductId) : null;
    return { ...this.stripOwner(room), pinnedProduct };
  }

  /** The caller's own currently-live room, if any — the studio's 409-recovery path. */
  async myLiveRoom(user: AuthedUser): Promise<OwnedRoom | null> {
    if (this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      const res = await pool.query(
        `select id, host_id, title, host_type, ai_disclosed, status, pinned_product_id
         from live_rooms where host_id=$1 and status='live' limit 1`,
        [user.id],
      );
      return res.rows[0] ? this.rowToRoom(res.rows[0]) : null;
    }
    return [...this.demoRooms.values()].find((r) => r.hostId === user.id && r.status === "live") ?? null;
  }

  /** Sellers go live. One active room per host. */
  async createRoom(user: AuthedUser, title: string): Promise<OwnedRoom> {
    const shop = await this.seller.getSeller(user);
    if (!shop || shop.status !== "active") {
      throw new ForbiddenException("Open your shop first — going live is for sellers.");
    }
    const cleanTitle = title.trim().slice(0, 120) || `${shop.shopName} — Live`;
    if (this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      const existing = await pool.query(`select id from live_rooms where host_id=$1 and status='live'`, [user.id]);
      if ((existing.rowCount ?? 0) > 0) {
        throw new ConflictException("You're already live — end your current stream first.");
      }
      const id = randomUUID();
      await pool.query(
        `insert into live_rooms (id, host_id, host_type, ai_disclosed, title, status, livekit_room, started_at)
         values ($1,$2,'seller',true,$3,'live',$4,now())`,
        [id, user.id, cleanTitle, `room_${id}`],
      );
      return {
        id,
        hostId: user.id,
        title: cleanTitle,
        hostType: "seller",
        aiDisclosed: true,
        status: "live",
        viewerCount: 0,
        pinnedProductId: null,
        flashDeal: null,
      };
    }
    const existingDemo = [...this.demoRooms.values()].find((r) => r.hostId === user.id && r.status === "live");
    if (existingDemo) throw new ConflictException("You're already live — end your current stream first.");
    // Refusing a new room beats the BoundedMap silently evicting someone
    // else's LIVE stream mid-broadcast.
    if (this.demoRooms.size >= DEMO_LIVE_CAPACITY) {
      throw new ServiceUnavailableException("Live is at capacity right now — try again in a few minutes.");
    }
    const id = `demo_room_${randomUUID().slice(0, 8)}`;
    const room: OwnedRoom = {
      id,
      hostId: user.id,
      title: cleanTitle,
      hostType: "seller",
      aiDisclosed: true,
      status: "live",
      viewerCount: 0,
      pinnedProductId: null,
      flashDeal: null,
      startedAtMs: Date.now(),
    };
    this.demoRooms.set(id, room);
    return room;
  }

  private async requireOwnedLiveRoom(user: AuthedUser, roomId: string): Promise<OwnedRoom> {
    const room = await this.getRoom(roomId);
    if (!room || room.hostId !== user.id) throw new NotFoundException("room not found");
    if (room.status !== "live") throw new ConflictException("this stream has ended");
    return room;
  }

  async endRoom(user: AuthedUser, roomId: string): Promise<void> {
    await this.requireOwnedLiveRoom(user, roomId);
    if (this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      await pool.query(
        `update live_rooms set status='ended', ended_at=now() where id=$1 and host_id=$2 and status='live'`,
        [roomId, user.id],
      );
      await this.closeLivekitRoom(roomId);
      return;
    }
    // Ended demo rooms are deleted, not kept: they'd otherwise pile up in the
    // BoundedMap until it evicts someone's LIVE stream. Lookups after this
    // 404, which every client treats as "this stream has ended".
    this.demoRooms.delete(roomId);
  }

  /** Pin one of YOUR OWN active products (or null to unpin). Every pin is an auditable room event. */
  async pinProduct(user: AuthedUser, roomId: string, productId: string | null): Promise<void> {
    await this.requireOwnedLiveRoom(user, roomId);
    if (productId) {
      const product = await this.commerce.getById(productId);
      if (!product) throw new NotFoundException("product not found or not active");
      // A host must not advertise another vendor's listing under their stream.
      if (product.sellerId !== user.id) throw new ForbiddenException("you can only pin your own products");
    }
    if (this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      await pool.query(`update live_rooms set pinned_product_id=$2 where id=$1 and host_id=$3`, [
        roomId,
        productId,
        user.id,
      ]);
      await pool.query(
        `insert into live_room_events (room_id, kind, payload) values ($1, $2, $3)`,
        [roomId, productId ? "pin_product" : "unpin", JSON.stringify({ productId })],
      );
      return;
    }
    const demo = this.demoRooms.get(roomId);
    if (demo) demo.pinnedProductId = productId;
  }

  /**
   * Viewer token: subscribe-only, LIVE rooms only, server-generated identity
   * (a caller must not be able to evict another viewer), no data publish.
   */
  async viewerToken(roomId: string): Promise<{ token: string; identity: string; livekitRoom: string }> {
    const room = await this.getRoom(roomId);
    if (!room || room.status !== "live") throw new NotFoundException("room is not live");
    const identity = `viewer-${randomUUID().slice(0, 12)}`;
    const livekitRoom = `room_${roomId}`;
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: livekitRoom, canPublish: false, canSubscribe: true, canPublishData: false });
    return { token: await at.toJwt(), identity, livekitRoom };
  }

  /**
   * Publisher token: the room's own host only. The LiveKit identity is a
   * random handle — participant identities are visible to every viewer in
   * the room, so the seller's auth uid must never ride in one.
   */
  async publisherToken(user: AuthedUser, roomId: string): Promise<{ token: string; identity: string; livekitRoom: string }> {
    await this.requireOwnedLiveRoom(user, roomId);
    const identity = `host-${randomUUID().slice(0, 12)}`;
    const livekitRoom = `room_${roomId}`;
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      ttl: "6h",
    });
    at.addGrant({ roomJoin: true, room: livekitRoom, canPublish: true, canSubscribe: true, canPublishData: true });
    return { token: await at.toJwt(), identity, livekitRoom };
  }

  private async reapStaleRooms(): Promise<void> {
    const demoCutoffMs = Date.now() - DEMO_STALE_ROOM_MS;
    for (const [id, room] of [...this.demoRooms.entries()]) {
      if (room.status !== "live" || (room.startedAtMs ?? 0) < demoCutoffMs) this.demoRooms.delete(id);
    }
    const pool = this.db.get();
    if (!pool) return;
    const res = await pool.query(
      `update live_rooms set status='ended', ended_at=now()
       where status='live' and started_at < now() - interval '12 hours'
       returning id`,
    );
    for (const row of res.rows) {
      this.logger.warn(`reaped stale live room ${String(row.id)}`);
      await this.closeLivekitRoom(String(row.id));
    }
  }
}
