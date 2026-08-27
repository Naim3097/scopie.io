"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LiveRoom, Product } from "@scopie/core";
import { API_BASE, DEMO_MODE, apiGet } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { getSeller, listSellerProducts, type SellerProfile } from "@/lib/seller";
import { connectPublisher, type LiveConnection } from "@/lib/live";
import { formatRM } from "@/lib/demo";

type StudioStage = "loading" | "no_shop" | "preview" | "starting" | "live" | "ended" | "error";

/**
 * Seller Live Studio: camera preview → go live (LiveKit publish when
 * configured; clearly-labeled simulation otherwise) → pin products → end.
 */
export default function StudioPage() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const lkRef = useRef<LiveConnection | null>(null);
  const roomRef = useRef<LiveRoom | null>(null);
  const authHeadersRef = useRef<Record<string, string> | null>(null);
  const mountedRef = useRef(true);
  const pinSeqRef = useRef(0);
  const [stage, setStage] = useState<StudioStage>("loading");
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [title, setTitle] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [broadcastAvailable, setBroadcastAvailable] = useState(false);
  const [broadcastReal, setBroadcastReal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Best-effort room end that survives page teardown (keepalive). */
  const endRoomBeacon = () => {
    const room = roomRef.current;
    const headers = authHeadersRef.current;
    if (!room || !headers || DEMO_MODE) return;
    void fetch(`${API_BASE}/v1/live/rooms/${room.id}/end`, {
      method: "POST",
      headers,
      keepalive: true,
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (session.loading) return;
    if (session.authEnabled && !session.userId) {
      router.replace(`/auth?next=${encodeURIComponent(pathname ?? "/studio")}`);
      return;
    }
    void (async () => {
      const s = await getSeller();
      setSeller(s);
      if (!s) {
        setStage("no_shop");
        return;
      }
      setTitle(`${s.shopName} — Live`);
      const [prods, cfg] = await Promise.all([
        listSellerProducts(),
        apiGet<{ livekit: boolean }>("/v1/live/config", { livekit: false }),
      ]);
      setProducts(prods);
      setBroadcastAvailable(cfg.livekit);
      setStage("preview");
    })();
    return () => {
      lkRef.current?.disconnect();
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
      // Leaving the studio mid-stream must not leave a ghost room live.
      endRoomBeacon();
    };
  }, [session.loading, session.userId, session.authEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A closed tab must not leave the room "live" forever — armed from
  // "starting" because the room is committed server-side before the
  // publisher connect finishes. While live, keep the beacon's auth headers
  // fresh: a stream can outlast the access token they were minted with.
  useEffect(() => {
    if ((stage !== "live" && stage !== "starting") || DEMO_MODE) return;
    window.addEventListener("pagehide", endRoomBeacon);
    const t = setInterval(() => {
      void getAuthHeaders().then((h) => {
        authHeadersRef.current = h;
      });
    }, 5 * 60_000);
    return () => {
      window.removeEventListener("pagehide", endRoomBeacon);
      clearInterval(t);
    };
  }, [stage]);

  // Camera preview as soon as the studio opens.
  useEffect(() => {
    if (stage !== "preview") return;
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        el.srcObject = stream;
        void el.play().catch(() => undefined);
      })
      .catch(() => setError("Camera access is needed to go live — check your browser permissions."));
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const createRoom = async (headers: Record<string, string>) =>
    fetch(`${API_BASE}/v1/live/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ title: title.trim() }),
      signal: AbortSignal.timeout(10_000),
    });

  const goLive = async () => {
    if (stage !== "preview") return;
    setStage("starting");
    setError(null);
    // Pure-demo site: no API exists — going live is a local, clearly-labeled
    // simulation over the camera preview.
    if (DEMO_MODE) {
      roomRef.current = {
        id: "demo_room_local",
        title: title.trim() || `${seller?.shopName ?? "My shop"} — Live`,
        hostType: "seller",
        aiDisclosed: true,
        status: "live",
        viewerCount: 0,
        pinnedProductId: null,
        flashDeal: null,
      };
      setBroadcastReal(false);
      setStage("live");
      return;
    }
    try {
      const headers = await getAuthHeaders();
      authHeadersRef.current = headers;
      let res = await createRoom(headers);
      if (res.status === 409) {
        // An earlier stream was orphaned (connect failure, closed tab).
        // Recover automatically: end it, then retry once.
        const mine = await fetch(`${API_BASE}/v1/live/mine`, { headers, signal: AbortSignal.timeout(5000) });
        if (mine.ok) {
          const { room } = (await mine.json()) as { room: { id: string } | null };
          if (room) {
            await fetch(`${API_BASE}/v1/live/rooms/${room.id}/end`, {
              method: "POST",
              headers,
              signal: AbortSignal.timeout(5000),
            }).catch(() => undefined);
            res = await createRoom(headers);
          }
        }
      }
      if (res.status === 401) {
        router.push(`/auth?next=${encodeURIComponent(pathname ?? "/studio")}`);
        return;
      }
      if (!res.ok) {
        const detail =
          res.status === 409
            ? "You're already live — end that stream first."
            : res.status === 503
              ? "Live is at capacity right now — try again in a few minutes."
              : "Couldn't start the stream.";
        setStage("preview");
        setError(detail);
        return;
      }
      const { room, publisher } = (await res.json()) as {
        room: LiveRoom;
        publisher: { demo: boolean; url: string | null; token: string | null };
      };
      roomRef.current = room;
      // Navigated away while the create was in flight? The room is already
      // live server-side — end it now or it ghosts the public list.
      if (!mountedRef.current) {
        endRoomBeacon();
        roomRef.current = null;
        return;
      }
      // The server's word beats a failed config fetch — never tell a seller
      // whose broadcast is real that it was a simulation.
      if (!publisher.demo) setBroadcastAvailable(true);
      if (!publisher.demo && publisher.url && publisher.token && videoRef.current) {
        // Real broadcast: LiveKit owns capture — release the preview stream.
        previewStreamRef.current?.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
        try {
          lkRef.current = await connectPublisher(publisher.url, publisher.token, videoRef.current);
        } catch {
          // The room was already committed server-side: end it, or the seller
          // is 409-locked out of ever going live again.
          endRoomBeacon();
          roomRef.current = null;
          setStage("preview");
          setError("Couldn't connect the broadcast — check your connection and try again.");
          return;
        }
        setBroadcastReal(true);
      } else {
        setBroadcastReal(false); // simulated: camera preview continues locally
      }
      setStage("live");
    } catch {
      // Create may or may not have committed — best-effort end covers both.
      endRoomBeacon();
      roomRef.current = null;
      setStage("preview");
      setError("Couldn't start the stream — check your connection and try again.");
    }
  };

  const pin = async (productId: string | null) => {
    const room = roomRef.current;
    if (!room) return;
    const previous = pinnedId;
    const seq = ++pinSeqRef.current;
    setPinnedId(productId);
    if (DEMO_MODE) return;
    try {
      const headers = await getAuthHeaders();
      authHeadersRef.current = headers; // keep the end beacon's headers fresh
      const res = await fetch(`${API_BASE}/v1/live/rooms/${room.id}/pin`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ productId }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`pin failed: ${res.status}`);
      if (seq === pinSeqRef.current) setError(null);
    } catch {
      // A silently failed pin means the seller pitches a product viewers
      // never see — surface it and roll back. Only the LATEST request may
      // touch the UI: a slow failure must not clobber a newer pin.
      if (seq === pinSeqRef.current) {
        setPinnedId(previous);
        setError("Couldn't pin that product — tap it again to retry.");
      }
    }
  };

  const endStream = async () => {
    const room = roomRef.current;
    lkRef.current?.disconnect();
    lkRef.current = null;
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    if (room && !DEMO_MODE) {
      try {
        await fetch(`${API_BASE}/v1/live/rooms/${room.id}/end`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* the 12h server-side reaper is the backstop */
      }
    }
    roomRef.current = null;
    setStage("ended");
  };

  if (stage === "loading") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 100 }}>
        <div className="buffering" style={{ position: "static" }}>
          <div className="ring" style={{ borderTopColor: "var(--accent)", borderColor: "var(--line-strong)" }}></div>
        </div>
      </main>
    );
  }

  if (stage === "no_shop") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48 }}>🎥</div>
        <h1 className="page-title">Live Studio is for sellers</h1>
        <p className="page-sub">Open your shop first, then come back to go live and sell in real time.</p>
        <Link href="/sell" className="btn btn-primary" style={{ width: "auto" }}>
          Open my shop
        </Link>
      </main>
    );
  }

  if (stage === "ended") {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48 }}>👏</div>
        <h1 className="page-title">Stream ended</h1>
        <p className="page-sub">Nice show{seller ? `, ${seller.shopName}` : ""}. Your products stay in the catalog.</p>
        <Link href="/sell" className="btn btn-primary" style={{ width: "auto" }}>
          Back to Seller Centre
        </Link>
      </main>
    );
  }

  const live = stage === "live";

  return (
    <main className="page page--pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div className="sec-label">LIVE STUDIO</div>
          <h1 style={{ fontSize: 22 }}>{seller?.shopName}</h1>
        </div>
        {live && <span className="live-badge">● LIVE{broadcastReal ? "" : " (demo)"}</span>}
      </div>

      <div className="live-stage">
        {/* muted: the host must not hear their own mic */}
        <video ref={videoRef} playsInline muted />
        {live && pinnedId && (
          <div className="live-pin">
            {(() => {
              const p = products.find((x) => x.id === pinnedId);
              return p ? (
                <div className="grow">
                  <b>{p.title}</b>
                  <span style={{ fontSize: 13 }}>{formatRM(p.priceSen)}</span>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {!live ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          <input
            className="auth-input"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Stream title"
          />
          <button className="btn btn-primary" onClick={() => void goLive()} disabled={stage === "starting"}>
            {stage === "starting" ? "Starting…" : "Go live"}
          </button>
          {!broadcastAvailable && (
            <div className="section-note" style={{ marginTop: 0 }}>
              Without the live backend configured, going live is a clearly-labeled simulation — viewers see a
              sample stream. Real broadcasting switches on with LiveKit credentials.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pin a product</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {products.length === 0 && (
              <div className="section-note" style={{ marginTop: 0 }}>
                No products yet — add some in the Seller Centre to pin them here.
              </div>
            )}
            {products.slice(0, 6).map((p) => (
              <button
                key={p.id}
                className="seller-row"
                style={pinnedId === p.id ? { borderColor: "var(--accent)" } : undefined}
                onClick={() => void pin(pinnedId === p.id ? null : p.id)}
              >
                <div className="grow" style={{ textAlign: "left" }}>
                  <b>{p.title}</b>
                </div>
                <span className="card-price" style={{ fontSize: 13.5 }}>
                  {formatRM(p.priceSen)}
                </span>
                <span style={{ color: "var(--accent)", fontSize: 12.5 }}>
                  {pinnedId === p.id ? "Pinned ✓" : "Pin"}
                </span>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 14, color: "var(--live)" }} onClick={() => void endStream()}>
            End stream
          </button>
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--live)", fontSize: 14, marginTop: 10 }}>
          {error}
        </p>
      )}
    </main>
  );
}
