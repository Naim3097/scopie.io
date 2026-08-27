"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_ENABLED, supabase } from "./supabase";
import { getClientId } from "./identity";
import { setTrackedUser } from "./events";

export interface SessionState {
  loading: boolean;
  /** Supabase configured for this build (NEXT_PUBLIC_SUPABASE_* set). */
  authEnabled: boolean;
  /** Auth uid when signed in; the anon id in demo mode; null = signed out. */
  userId: string | null;
  email: string | null;
  /** True in demo mode (no Supabase project configured). */
  isGuest: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  loading: true,
  authEnabled: AUTH_ENABLED,
  userId: null,
  email: null,
  isGuest: !AUTH_ENABLED,
  signOut: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(AUTH_ENABLED);
  const [userId, setUserId] = useState<string | null>(AUTH_ENABLED ? null : "pending");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      // Demo mode: a stable guest identity (also the event actor).
      setUserId(getClientId());
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
      setTrackedUser(data.session?.user.id ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      setTrackedUser(session?.user.id ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      authEnabled: AUTH_ENABLED,
      userId: userId === "pending" ? null : userId,
      email,
      isGuest: !AUTH_ENABLED,
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [loading, userId, email],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
