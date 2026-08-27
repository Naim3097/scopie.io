import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";

/**
 * Cloudflare Stream driver. The API never proxies video bytes: creators get
 * a one-shot direct-upload URL and the browser talks to Cloudflare directly;
 * Cloudflare calls our webhook when the asset is ready.
 *
 * Config: CF_ACCOUNT_ID + CF_STREAM_TOKEN (API token with Stream edit),
 * CF_WEBHOOK_SECRET (returned when subscribing the webhook — see
 * `PUT /accounts/{id}/stream/webhook`).
 */
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor() {
    // A Stream-configured deploy WITHOUT the webhook secret would mint
    // uploads whose ready-webhooks are all rejected — every video stranded
    // in 'processing' with no alarm. Fail fast in production; scream in dev.
    if (this.configured && !process.env.CF_WEBHOOK_SECRET) {
      const msg = "CF_STREAM_TOKEN is set but CF_WEBHOOK_SECRET is missing — ready-webhooks would all be rejected";
      if (process.env.NODE_ENV === "production") throw new Error(msg);
      this.logger.error(msg);
    }
  }

  get configured(): boolean {
    return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_STREAM_TOKEN);
  }

  private get base(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/stream`;
  }

  /** One-shot direct-creator-upload URL (browser POSTs the file to it). */
  async createDirectUpload(creatorId: string, videoId: string): Promise<{ uploadUrl: string; uid: string }> {
    const res = await fetch(`${this.base}/direct_upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        maxDurationSeconds: 180, // short-form feed content; reserved storage stays tight
        creator: creatorId, // ≤64 chars — uuid fits
        meta: { scopieVideoId: videoId },
        allowedOrigins: ["scopie.io", "www.scopie.io", "localhost:3000"],
        // No documented default — expire abandoned reservations explicitly so
        // they release their reserved storage minutes.
        expiry: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`stream direct_upload failed: ${res.status}`);
    const json = (await res.json()) as { success: boolean; result?: { uploadURL: string; uid: string } };
    if (!json.success || !json.result) throw new Error("stream direct_upload returned no result");
    return { uploadUrl: json.result.uploadURL, uid: json.result.uid };
  }

  /**
   * Verify Cloudflare's Webhook-Signature header:
   *   `time=<unix>,sig1=<hex hmac-sha256 of "<time>.<raw body>">`
   * signed with the webhook secret. Stale timestamps (>5 min) are rejected
   * to blunt replay.
   */
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = process.env.CF_WEBHOOK_SECRET;
    if (!secret) {
      // Distinguish misconfiguration from forgery in the logs — a rejected
      // LEGITIMATE webhook must be observable.
      this.logger.error("stream webhook rejected: CF_WEBHOOK_SECRET is not configured");
      return false;
    }
    if (!signatureHeader) {
      this.logger.warn("stream webhook rejected: missing Webhook-Signature header");
      return false;
    }
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((kv) => kv.split("=", 2) as [string, string]),
    );
    const time = parts["time"];
    const sig = parts["sig1"];
    if (!time || !sig) return false;
    const age = Math.abs(Date.now() / 1000 - Number(time));
    if (!Number.isFinite(age) || age > 300) return false;
    const expected = createHmac("sha256", secret).update(`${time}.${rawBody.toString("utf8")}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) this.logger.warn("stream webhook rejected: signature mismatch");
    return ok;
  }
}
