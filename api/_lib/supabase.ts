/**
 * Service-role Supabase client for the serverless functions.
 *
 * The catalogue tables are writable only by this key: browsers read them through
 * RLS-guarded SELECT policies and never write to them directly. Ratings are the
 * opposite — written from the browser under the user's own JWT.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Accept a project URL pasted without its scheme, and ignore stray whitespace. */
function normaliseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Returns null when the service credentials are not configured, which lets the
 * API keep serving live upstream data (just without persistence or user scores)
 * instead of failing outright.
 */
export function serviceClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = normaliseUrl(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
