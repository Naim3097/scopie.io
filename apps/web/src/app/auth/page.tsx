"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AUTH_ENABLED, supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

/**
 * Same-origin path only. Rejects protocol-relative ("//evil.com") and
 * backslash ("/\evil.com" — the WHATWG URL parser treats \ as / for http)
 * redirects; resolving against the origin and comparing back is the only
 * check that catches every encoding trick.
 */
function safeNext(next: string): string {
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/profile";
    return url.pathname + url.search;
  } catch {
    return "/profile";
  }
}

/**
 * Email OTP sign-in (Supabase). Phone/WhatsApp OTP slots into the same
 * two-step flow once the provider is connected. In demo mode (no Supabase
 * project configured) the page explains guest mode instead of pretending.
 */
function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const next = params.get("next") ?? "/profile";
  const [step, setStep] = useState<"email" | "code">("email");
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in (e.g. bounced here by a stale-token race): leave.
  useEffect(() => {
    if (AUTH_ENABLED && !session.loading && session.userId) {
      router.replace(safeNext(next));
    }
  }, [session.loading, session.userId, next, router]);

  if (!AUTH_ENABLED) {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48 }}>👋</div>
        <h1 className="page-title">You&rsquo;re browsing as a guest</h1>
        <p className="page-sub">
          Accounts open with the full launch — everything works in guest mode for now, and your activity stays on
          this device.
        </p>
        <Link href="/feed" className="btn btn-primary" style={{ width: "auto" }}>
          Keep browsing
        </Link>
      </main>
    );
  }

  const sendCode = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email.includes("@") || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429
          ? "You can request a new code in a minute."
          : "We couldn't send the code — check the address and try again.",
      );
      return;
    }
    setStep("code");
  };

  const verify = async () => {
    const token = code.trim();
    if (token.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.verifyOtp({
      email: emailInput.trim().toLowerCase(),
      token,
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError("That code didn't match — check it or request a new one.");
      return;
    }
    router.replace(safeNext(next));
  };

  return (
    <main className="page page--pad">
      <h1 className="page-title">
        Sign in to <span style={{ color: "var(--cyan)" }}>Scopie</span>
      </h1>
      <p className="page-sub">
        {step === "email"
          ? "We'll email you a 6-digit code — no password to remember."
          : `Enter the code we sent to ${emailInput.trim()}.`}
      </p>

      {step === "email" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
          <input
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email address"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendCode()}
          />
          <button className="btn btn-primary" onClick={() => void sendCode()} disabled={busy}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
          <input
            className="auth-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            aria-label="One-time code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && void verify()}
          />
          <button className="btn btn-primary" onClick={() => void verify()} disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button className="btn btn-ghost" onClick={() => void sendCode()} disabled={busy}>
            Resend code
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            disabled={busy}
          >
            Use a different email
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--live)", fontSize: 14, marginTop: 12 }}>
          {error}
        </p>
      )}
      <div className="section-note">
        WhatsApp sign-in is coming — it uses this same code flow with your phone number.
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  );
}
