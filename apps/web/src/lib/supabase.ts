"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getGuestHeaderId } from "./identity";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null in demo mode — every consumer must handle both worlds. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const AUTH_ENABLED = supabase !== null;

/**
 * Identity headers for API calls: a Supabase bearer token when signed in,
 * or the stable guest id header in demo mode (so demo order ownership is
 * consistent across checkout and status polling).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { authorization: `Bearer ${token}` } : {};
  }
  return { "x-scopie-guest": getGuestHeaderId() };
}
