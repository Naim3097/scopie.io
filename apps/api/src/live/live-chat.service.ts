import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { LiveChatMessage, LiveRoom, Product } from "@scopie/core";
import { Db } from "../db";
import { LiveService } from "./live.service";
import { HostBrainService } from "./host-brain.service";
import { ModerationService } from "../videos/moderation.service";
import type { AuthedUser } from "../auth/auth.service";
import { BoundedMap } from "../util/bounded-map";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES_PER_ROOM = 200;
const PAGE = 50;
/** Small human-feel delay before the AI host answers. */
const HOST_REPLY_DELAY_MS = 700;

interface DemoRoomChat {
  seq: number;
  messages: LiveChatMessage[];
}

function productSnapshot(p: Product | null): LiveChatMessage["product"] {
  return p ? { id: p.id, title: p.title, priceSen: p.priceSen } : null;
}

/**
 * Live room chat + the AI-host answer loop. DB rooms (UUID ids) persist to
 * live_chat — with every AI reply mirrored to live_room_events
 * ('host_answer') as the audit record of what the AI said. Demo/showcase
 * rooms chat in bounded memory. Guests may chat in both.
 */
@Injectable()
export class LiveChatService {
  private readonly logger = new Logger(LiveChatService.name);
  private readonly demoChats = new BoundedMap<string, DemoRoomChat>(500);
  private readonly handleCache = new BoundedMap<string, string>(1000);

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(LiveService) private readonly live: LiveService,
    @Inject(HostBrainService) private readonly brain: HostBrainService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  private isDbRoom(roomId: string): boolean {
    return Boolean(this.db.get()) && UUID_RE.test(roomId);
  }

  private async displayName(user: AuthedUser): Promise<string> {
    if (user.isGuest || !UUID_RE.test(user.id)) {
      return `guest-${user.id.replace(/[^a-z0-9]/gi, "").slice(-4).padStart(4, "0")}`;
    }
    const cached = this.handleCache.get(user.id);
    if (cached) return cached;
    const pool = this.db.get();
    if (pool) {
      try {
        const res = await pool.query(`select handle from profiles where id=$1`, [user.id]);
        const handle = res.rows[0]?.handle ? String(res.rows[0].handle) : "shopper";
        this.handleCache.set(user.id, handle);
        return handle;
      } catch {
        /* fall through */
      }
    }
    return "shopper";
  }

  async listMessages(roomId: string, sinceId?: string): Promise<LiveChatMessage[]> {
    const room = await this.live.getRoom(roomId);
    if (!room) throw new NotFoundException("room not found");
    if (this.isDbRoom(roomId)) {
      const pool = this.db.get()!;
      // 18-digit cap: a longer digit string overflows Postgres bigint (500).
      const since = /^\d{1,18}$/.test(sinceId ?? "") ? sinceId! : "0";
      // TAIL of the feed (same semantics as the demo branch): a fresh viewer
      // gets the latest messages, not the room's ancient history.
      const res = await pool.query(
        `select id, display_name, body, is_host, product from
           (select id, display_name, body, is_host, product from live_chat
             where room_id=$1 and id > $2 order by id desc limit ${PAGE}) t
         order by id asc`,
        [roomId, since],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        from: String(r.display_name),
        text: String(r.body),
        isHost: Boolean(r.is_host),
        product: (r.product as LiveChatMessage["product"]) ?? null,
      }));
    }
    const chat = this.demoChats.get(roomId);
    if (!chat) return [];
    const since = Number(sinceId ?? 0) || 0;
    return chat.messages.filter((m) => Number(m.id) > since).slice(-PAGE);
  }

  async postMessage(user: AuthedUser, roomId: string, textRaw: string): Promise<LiveChatMessage> {
    const text = textRaw.trim().slice(0, 300);
    if (text.length === 0) throw new BadRequestException("say something first");
    const room = await this.live.getRoom(roomId);
    if (!room || room.status !== "live") throw new NotFoundException("room is not live");

    // Same moderation gate AND outage policy as captions: a flagged verdict
    // never posts; a provider outage fails open with a logged reason rather
    // than turning all chat into 500s.
    let verdict: { flagged: boolean; reason: string };
    try {
      verdict = await this.moderation.moderateText(text);
    } catch (err) {
      this.logger.warn(`chat moderation outage, allowing message: ${(err as Error).message}`);
      verdict = { flagged: false, reason: "provider outage — allowed (chat MVP policy)" };
    }
    if (verdict.flagged) {
      this.logger.warn(`chat rejected in ${roomId}: ${verdict.reason}`);
      throw new BadRequestException("Let's keep it kind — that message can't be posted.");
    }

    const from = await this.displayName(user);
    const message = await this.store(roomId, {
      from,
      text,
      isHost: false,
      product: null,
      senderId: !user.isGuest && UUID_RE.test(user.id) ? user.id : null,
    });

    if (room.hostType === "ai") this.scheduleHostReply(room, roomId, message);
    return message;
  }

  /** Non-blocking: the POST returns immediately; the reply lands for the next poll. */
  private scheduleHostReply(room: LiveRoom, roomId: string, viewerMessage: LiveChatMessage): void {
    setTimeout(() => {
      void (async () => {
        // The room may have ended inside the delay window — a reply then
        // would resurrect a deleted demo room's chat entry.
        const fresh = await this.live.getRoom(roomId);
        if (!fresh || fresh.status !== "live") return;
        const answer = await this.brain.answer(room, viewerMessage.text);
        if (!answer) return;
        const payload = {
          from: "Scopie",
          text: answer.text,
          isHost: true,
          product: productSnapshot(answer.product),
          senderId: null,
        };
        if (this.isDbRoom(roomId)) {
          // Chat row + audit row commit together: the audit trail of what
          // the AI said must never lag what viewers were shown.
          // stream_ms stays null for chat answers until the A/V worker
          // reports stream position.
          const pool = this.db.get()!;
          const client = await pool.connect();
          try {
            await client.query("begin");
            await client.query(
              `insert into live_chat (room_id, sender_id, display_name, body, is_host, product)
               values ($1,null,$2,$3,true,$4)`,
              [roomId, payload.from, payload.text, payload.product ? JSON.stringify(payload.product) : null],
            );
            await client.query(`insert into live_room_events (room_id, kind, payload) values ($1,'host_answer',$2)`, [
              roomId,
              JSON.stringify({
                text: answer.text,
                productId: answer.product?.id ?? null,
                inReplyToId: viewerMessage.id,
              }),
            ]);
            await client.query("commit");
          } catch (err) {
            await client.query("rollback").catch(() => undefined);
            throw err;
          } finally {
            client.release();
          }
          return;
        }
        await this.store(roomId, payload);
      })().catch((err: Error) => this.logger.error(`host reply failed in ${roomId}: ${err.message}`));
    }, HOST_REPLY_DELAY_MS);
  }

  private async store(
    roomId: string,
    msg: { from: string; text: string; isHost: boolean; product: LiveChatMessage["product"]; senderId: string | null },
  ): Promise<LiveChatMessage> {
    if (this.isDbRoom(roomId)) {
      const pool = this.db.get()!;
      const insert = (senderId: string | null) =>
        pool.query(
          `insert into live_chat (room_id, sender_id, display_name, body, is_host, product)
           values ($1,$2,$3,$4,$5,$6) returning id`,
          [roomId, senderId, msg.from, msg.text, msg.isHost, msg.product ? JSON.stringify(msg.product) : null],
        );
      let res;
      try {
        res = await insert(msg.senderId);
      } catch (err) {
        // 23503: a UUID identity with no profiles row yet (plain-Postgres
        // deployments provision profiles lazily) — keep the message, drop
        // the FK link rather than 500ing the chat.
        if ((err as { code?: string }).code !== "23503") throw err;
        res = await insert(null);
      }
      return { id: String(res.rows[0].id), from: msg.from, text: msg.text, isHost: msg.isHost, product: msg.product };
    }
    let chat = this.demoChats.get(roomId);
    if (!chat) {
      chat = { seq: 0, messages: [] };
      this.demoChats.set(roomId, chat);
    }
    chat.seq += 1;
    const stored: LiveChatMessage = {
      id: String(chat.seq),
      from: msg.from,
      text: msg.text,
      isHost: msg.isHost,
      product: msg.product,
    };
    chat.messages.push(stored);
    if (chat.messages.length > MAX_MESSAGES_PER_ROOM) chat.messages.shift();
    return stored;
  }
}
