import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
// Load the repo-root .env first; a package-local .env only fills variables
// the root file left unset (dotenv never overwrites existing values).
// Without this, tsx/node never see DATABASE_URL & co. and the stack silently
// stays in demo mode.
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv();

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { text } from "express";
import { AppModule } from "./app.module";

/** Exact origins only. credentials:true with a reflected origin is how CSRF ships. */
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://scopie.io",
  "https://www.scopie.io",
  ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
];

async function bootstrap() {
  // rawBody is required for webhook signature verification (payments).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Deployed behind one proxy hop (Railway/Fly/Vercel) — without this the
  // "per-IP" throttler keys every client to the proxy's address and the
  // whole site shares one rate bucket.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);
  // sendBeacon flushes arrive as text/plain to stay CORS-preflight-free —
  // parse them so the events endpoint can accept the final watch batch.
  app.use(text({ type: "text/plain" }));
  app.enableCors({ origin: ALLOWED_ORIGINS, credentials: true });
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Scopie API listening on :${port}`);
}
void bootstrap();
