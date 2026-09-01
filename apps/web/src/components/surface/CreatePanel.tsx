"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { Hero } from "@/components/Glyph";
import { getAuthHeaders } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { track } from "@/lib/events";

type Stage = "compose" | "initiating" | "uploading" | "processing" | "posted" | "error";

interface MyUpload {
  id: string;
  caption: string;
  status: string;
  moderation: string;
}

function statusLabel(u: MyUpload): string {
  if (u.status === "processing") return "Processing";
  if (u.status === "blocked" || u.status === "removed") return "Upload failed — try again";
  if (u.moderation === "pending") return "In review";
  if (u.moderation === "flagged" || u.moderation === "rejected") return "Not approved";
  return "Live in the feed";
}

/**
 * Creator upload, in a panel over the surface. Real mode: caption + file →
 * direct-to-Cloudflare upload with progress → "processing". Demo mode:
 * instant publish with a stock clip. File validation runs BEFORE any server
 * call — an errant click must not mint upload reservations.
 * PWA note: upload-first by design; capture-first waits for the native shell.
 */
export function CreatePanel({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myUploads, setMyUploads] = useState<MyUpload[]>([]);

  // "My uploads" — the creator's only window into review/processing outcomes.
  useEffect(() => {
    if (DEMO_MODE || session.loading || (session.authEnabled && !session.userId)) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/videos/mine`, {
          headers: await getAuthHeaders(),
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const { videos } = (await res.json()) as { videos: MyUpload[] };
          setMyUploads(videos);
        }
      } catch {
        /* non-blocking */
      }
    })();
  }, [session.loading, session.userId, session.authEnabled, stage]);

  const authNext = encodeURIComponent("/?panel=create");

  const post = async () => {
    // Synchronous re-entrancy guard: a double-tap during init must not mint
    // two uploads.
    if (stage !== "compose" && stage !== "error") return;
    if (session.authEnabled && !session.userId) {
      router.push(`/auth?next=${authNext}`);
      return;
    }
    setError(null);

    // Pure-demo site (no API): register locally so the feed shows it.
    if (DEMO_MODE) {
      try {
        const raw = JSON.parse(localStorage.getItem("scopie_demo_myvideos") ?? "[]") as unknown;
        // ONE array instance end to end — two fresh `?:` arrays here once
        // discarded the unshifted post while still claiming "Posted!".
        const mine = Array.isArray(raw) ? raw : [];
        mine.unshift({ caption: caption.trim() || "My first Scopie video", at: Date.now() });
        localStorage.setItem("scopie_demo_myvideos", JSON.stringify(mine.slice(0, 20)));
      } catch {
        /* best-effort */
      }
      setStage("posted");
      return;
    }

    setStage("initiating");
    track({ type: "video.view", subjectId: "create", surface: "feed", meta: { intent: "post" } });
    try {
      const res = await fetch(`${API_BASE}/v1/videos/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({ caption: caption.trim() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401) {
        router.push(`/auth?next=${authNext}`);
        return;
      }
      if (!res.ok) throw new Error(`upload init ${res.status}`);
      const { uploadUrl, demo } = (await res.json()) as { uploadUrl: string | null; demo: boolean };

      if (demo || !uploadUrl) {
        setStage("posted"); // API demo-published instantly
        return;
      }

      // File was validated before we ever got here (see the guard in the
      // button handler) — belt and braces.
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setStage("compose");
        setError("Choose a video file first.");
        return;
      }

      setStage("uploading");
      setProgress(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", uploadUrl);
        // Stall watchdog: a silently dropped connection fires no onerror —
        // abort if no progress tick for 60s.
        let lastTick = Date.now();
        const watchdog = setInterval(() => {
          if (Date.now() - lastTick > 60_000) {
            clearInterval(watchdog);
            xhr.abort();
          }
        }, 5000);
        const form = new FormData();
        form.append("file", file);
        xhr.upload.onprogress = (e) => {
          lastTick = Date.now();
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        const done = (fn: () => void) => {
          clearInterval(watchdog);
          xhrRef.current = null;
          fn();
        };
        xhr.onload = () =>
          done(() => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`))));
        xhr.onerror = () => done(() => reject(new Error("upload failed")));
        xhr.onabort = () => done(() => reject(new Error("upload cancelled")));
        xhr.send(form);
      });
      setStage("processing");
    } catch (err) {
      setStage("error");
      setError(
        (err as Error).message === "upload cancelled"
          ? "Upload cancelled."
          : "Your video wasn't posted. Try again.",
      );
    }
  };

  const handlePostClick = () => {
    // Real mode: validate the file BEFORE any server call (no orphan
    // reservations from errant clicks).
    if (!DEMO_MODE) {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Choose a video file first.");
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        setError("Videos up to 200 MB for now — trim it a little.");
        return;
      }
    }
    void post();
  };

  const cancelUpload = () => xhrRef.current?.abort();

  if (stage === "posted" || stage === "processing") {
    const processing = stage === "processing";
    return (
      <div className="panel-pad" style={{ textAlign: "center", paddingTop: 60 }}>
        {processing ? <Hero kind="camera" /> : <Hero kind="check" tone="good" />}
        <h2 className="page-title">{processing ? "Processing your video" : "Posted"}</h2>
        <p className="page-sub">
          {processing
            ? "It appears in the feed once it's ready and reviewed. Track it below under My uploads."
            : "Your video is live in the feed."}
        </p>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={onDone}>
          Back to the feed
        </button>
        {processing && <MyUploads uploads={myUploads} />}
      </div>
    );
  }

  const busy = stage === "initiating" || stage === "uploading";

  return (
    <div className="panel-pad">
      {/* The panel header already says "Create". */}
      <p className="panel-lede">Post a clip of you or your product.</p>

      <div className="create-form">
        <textarea
          className="auth-input"
          style={{ minHeight: 90, resize: "vertical" }}
          placeholder="Write a caption… #ScopieStyle"
          maxLength={500}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          aria-label="Caption"
        />
        {!DEMO_MODE && (
          <>
            {/* the raw OS file control is the one non-pill widget in the app —
                hide it behind a styled label */}
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              id="create-file"
              className="sr-only"
              aria-label="Video file"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <label htmlFor="create-file" className="btn btn-ghost" style={{ cursor: "pointer" }}>
              {fileName ?? "Choose a video…"}
            </label>
          </>
        )}
        {DEMO_MODE && (
          <div className="section-note" style={{ marginTop: 0 }}>
            Demo mode: posting publishes a sample clip with your caption — real uploads switch on with the video
            backend.
          </div>
        )}
        {stage === "uploading" ? (
          <div>
            <div
              className="upload-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Upload progress"
            >
              <div className="upload-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              {/* no aria-live: the progressbar above announces; a live region
                  here chattered on every tick */}
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Uploading… {progress}%</span>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={cancelUpload}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handlePostClick} disabled={busy}>
            {stage === "initiating" ? "Preparing…" : "Post to Scopie"}
          </button>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--live-ink)", fontSize: 14 }}>
            {error}
          </p>
        )}
      </div>

      {!DEMO_MODE && <MyUploads uploads={myUploads} />}
    </div>
  );
}

function MyUploads({ uploads }: { uploads: MyUpload[] }) {
  if (uploads.length === 0) return null;
  return (
    <div style={{ marginTop: 26, maxWidth: 440, textAlign: "left" }}>
      <h3 style={{ fontSize: 16, marginBottom: 10 }}>My uploads</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {uploads.slice(0, 10).map((u) => (
          <div key={u.id} className="seller-row">
            <div className="grow">
              <b>{u.caption || "Untitled"}</b>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>{statusLabel(u)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
