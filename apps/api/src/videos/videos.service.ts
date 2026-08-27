import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Video } from "@scopie/core";
import { Db } from "../db";
import { StreamService } from "./stream.service";
import { ModerationService } from "./moderation.service";
import type { AuthedUser } from "../auth/auth.service";
import { BoundedMap } from "../util/bounded-map";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Demo uploads borrow an existing public stream so the flow is demonstrable. */
const DEMO_UPLOAD_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const DEMO_UPLOAD_POSTER = "/posters/poster-a.png";

/** Concurrent 'processing' uploads per creator — each holds a CF storage reservation. */
const MAX_PENDING_UPLOADS = 5;

export interface CreateUploadResult {
  videoId: string;
  /** Cloudflare direct-upload URL, or null in demo mode (instant publish). */
  uploadUrl: string | null;
  demo: boolean;
}

/**
 * Creator video pipeline.
 *
 * Real path (CF + DB + real identity): direct-upload URL → browser uploads
 * straight to Cloudflare → signature-verified 'ready' webhook flips the row
 * with playback URLs → moderation → feed. The API never touches video bytes.
 *
 * Demo path: instant publish with a stock stream + the creator's caption
 * (still moderated). Demo entries live in a bounded in-memory store and
 * never mix into DB-mode feeds.
 *
 * Recovery: a 60s sweep (armed in DB mode) expires abandoned 'processing'
 * rows (CF fires NO webhook for expired reservations) and re-drives any
 * ready-but-still-pending moderation.
 */
@Injectable()
export class VideosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  /** Demo-mode creator videos (newest first), keyed by id. creatorId = FULL identity. */
  private readonly demoVideos = new BoundedMap<string, Video>(1000);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(StreamService) private readonly stream: StreamService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  onModuleInit(): void {
    if (this.db.available) {
      this.sweepTimer = setInterval(() => {
        void this.sweep().catch((err: Error) => this.logger.error(`video sweep failed: ${err.message}`));
      }, 60_000);
    }
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Recovery duties:
   *  1. Abandoned uploads: 'processing' rows older than the reservation
   *     window get closed out with an audit entry — no eternal 'processing'.
   *  2. Stranded moderation: ready rows still 'pending' re-drive moderation
   *     (covers a DB blip between the ready-flip and the verdict write).
   */
  async sweep(): Promise<void> {
    const pool = this.db.get();
    if (!pool) return;
    const expired = await pool.query(
      `update videos set status='removed'
       where status='processing' and created_at < now() - interval '2 hours'
       returning id`,
    );
    for (const row of expired.rows) {
      await pool.query(
        `insert into moderation_log (subject_type, subject_id, action, reason, actor)
         values ('video', $1, 'removed', 'upload abandoned — reservation expired without a completed upload', 'system:sweep')`,
        [row.id],
      );
    }
    const stranded = await pool.query(
      `select id, caption from videos
       where status='ready' and moderation_state='pending' and created_at < now() - interval '5 minutes'
       limit 20`,
    );
    for (const row of stranded.rows) {
      await this.moderation
        .queueVideoModeration(row.id as string, row.caption as string)
        .catch((err: Error) => this.logger.error(`re-moderation failed for ${row.id}: ${err.message}`));
    }
  }

  private isDbIdentity(user: AuthedUser): boolean {
    return this.db.available && !user.isGuest && UUID_RE.test(user.id);
  }

  async createUpload(user: AuthedUser, caption: string): Promise<CreateUploadResult> {
    const cleanCaption = caption.trim().slice(0, 500);

    if (this.stream.configured && this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      // Cap concurrent reservations per creator: each pending upload holds
      // 3 storage-minutes at Cloudflare until its 30-min expiry.
      const pending = await pool.query(
        `select count(*)::int as n from videos where creator_id=$1 and status='processing'`,
        [user.id],
      );
      if (Number(pending.rows[0]?.n ?? 0) >= MAX_PENDING_UPLOADS) {
        throw new ConflictException("You have uploads still processing — give them a moment to finish.");
      }
      const videoId = randomUUID();
      const upload = await this.stream.createDirectUpload(user.id, videoId);
      await pool.query(
        `insert into videos (id, creator_id, caption, cf_stream_uid, status, moderation_state)
         values ($1,$2,$3,$4,'processing','pending')`,
        [videoId, user.id, cleanCaption, upload.uid],
      );
      return { videoId, uploadUrl: upload.uploadUrl, demo: false };
    }

    // Demo publish: instant — but captions are still screened (an anonymous
    // curl loop must not pin arbitrary text to the top of the public feed).
    const verdict = await this.moderation
      .moderateText(cleanCaption)
      .catch(() => ({ flagged: false, reason: "provider unavailable" }));
    if (verdict.flagged) {
      throw new BadRequestException("That caption isn't allowed on Scopie.");
    }
    const videoId = `demo_${randomUUID().slice(0, 12)}`;
    const video: Video = {
      id: videoId,
      creatorId: user.id, // FULL identity — ownership checks compare exactly
      caption: cleanCaption || "My first Scopie video ✨",
      hlsUrl: DEMO_UPLOAD_HLS,
      posterUrl: DEMO_UPLOAD_POSTER,
      hashtags: [],
      productIds: [],
      stats: { likes: 0, comments: 0, shares: 0 },
    };
    this.demoVideos.set(videoId, video);
    return { videoId, uploadUrl: null, demo: true };
  }

  /** Newest demo-authored videos with display-safe creator labels. */
  listDemoAuthored(limit: number): Video[] {
    return [...this.demoVideos.values()]
      .reverse()
      .slice(0, limit)
      .map((v) => ({ ...v, creatorId: this.displayName(v.creatorId) }));
  }

  private displayName(creatorId: string): string {
    if (creatorId.startsWith("guest:")) return `guest-${creatorId.slice(-4)}`;
    return creatorId.slice(0, 8);
  }

  /** Creator's own uploads with pipeline status. Ownership = exact identity. */
  async listMine(user: AuthedUser): Promise<Array<{ id: string; caption: string; status: string; moderation: string }>> {
    if (this.isDbIdentity(user)) {
      const pool = this.db.get()!;
      const res = await pool.query(
        `select id, caption, status, moderation_state from videos
         where creator_id=$1 order by created_at desc limit 50`,
        [user.id],
      );
      return res.rows.map((r) => ({
        id: r.id,
        caption: r.caption,
        status: r.status,
        moderation: r.moderation_state,
      }));
    }
    return [...this.demoVideos.values()]
      .reverse()
      .filter((v) => v.creatorId === user.id)
      .map((v) => ({ id: v.id, caption: v.caption, status: "ready", moderation: "approved" }));
  }

  /**
   * Cloudflare webhook (ready OR error): idempotent on cf_stream_uid. A
   * retry after a partial failure re-drives moderation instead of no-oping.
   */
  async handleStreamReady(payload: {
    uid: string;
    readyToStream?: boolean;
    duration?: number;
    playback?: { hls?: string };
    thumbnail?: string;
    status?: { state?: string; errReasonCode?: string; errorReasonCode?: string; errReasonText?: string; errorReasonText?: string };
  }): Promise<void> {
    const pool = this.db.get();
    if (!pool) return; // webhooks only matter in DB mode
    if (payload.status?.state === "error") {
      // Docs show both errReason*/errorReason* spellings — accept either.
      const code = payload.status.errReasonCode ?? payload.status.errorReasonCode ?? "unknown";
      const text = payload.status.errReasonText ?? payload.status.errorReasonText ?? "";
      const res = await pool.query(
        `update videos set status='blocked' where cf_stream_uid=$1 and status='processing' returning id`,
        [payload.uid],
      );
      const row = res.rows[0];
      if (row) {
        // 'blocked' status = processing failure (policy blocks live in
        // moderation_state) — logged so the decision is never silent.
        await pool.query(
          `insert into moderation_log (subject_type, subject_id, action, reason, actor)
           values ('video', $1, 'removed', $2, 'system:stream')`,
          [row.id, `stream processing failed: ${code} ${text}`.trim()],
        );
      }
      this.logger.warn(`stream ${payload.uid} failed processing: ${code}`);
      return;
    }
    if (!payload.readyToStream || !payload.playback?.hls) return; // not a terminal-ready event
    const res = await pool.query(
      `update videos set status='ready', hls_url=$2, poster_url=$3, duration_ms=$4
       where cf_stream_uid=$1 and status='processing'
       returning id, caption`,
      [
        payload.uid,
        payload.playback.hls,
        payload.thumbnail ?? null,
        payload.duration ? Math.round(payload.duration * 1000) : null,
      ],
    );
    let row = res.rows[0];
    if (!row) {
      // Already flipped — if moderation never landed (partial failure before
      // a CF retry), this retry re-drives it instead of no-oping.
      const pendingRes = await pool.query(
        `select id, caption from videos where cf_stream_uid=$1 and status='ready' and moderation_state='pending'`,
        [payload.uid],
      );
      row = pendingRes.rows[0];
      if (!row) return; // genuinely processed
    }
    await this.moderation.queueVideoModeration(row.id as string, row.caption as string);
    this.logger.log(`video ${row.id} ready (stream ${payload.uid}) — moderation complete/queued`);
  }

  /** Feed source for DB mode: ready + approved, recency-decayed engagement. */
  async listFeed(limit: number): Promise<Video[] | null> {
    const pool = this.db.get();
    if (!pool) return null;
    const res = await pool.query(
      `select v.id, v.creator_id, v.caption, v.hls_url, v.poster_url, v.duration_ms,
              coalesce(s.likes,0) likes, coalesce(s.comments,0) comments, coalesce(s.shares,0) shares
       from videos v
       left join video_stats s on s.video_id = v.id
       where v.status='ready' and v.moderation_state='approved' and v.hls_url is not null
       order by (coalesce(s.likes,0) + 2*coalesce(s.comments,0) + 3*coalesce(s.shares,0) + 1)
                * exp(-extract(epoch from (now() - v.created_at)) / 172800.0) desc
       limit $1`,
      [limit],
    );
    if ((res.rowCount ?? 0) === 0) return [];
    return res.rows.map((r) => ({
      id: r.id,
      creatorId: this.displayName(String(r.creator_id)),
      caption: r.caption,
      hlsUrl: r.hls_url,
      posterUrl: r.poster_url ?? undefined,
      durationMs: r.duration_ms ?? undefined,
      hashtags: [],
      productIds: [],
      stats: { likes: Number(r.likes), comments: Number(r.comments), shares: Number(r.shares) },
    }));
  }

  async getMineOrThrow(user: AuthedUser, videoId: string): Promise<void> {
    const mine = await this.listMine(user);
    if (!mine.some((v) => v.id === videoId)) throw new NotFoundException("video not found");
  }
}
