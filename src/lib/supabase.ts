import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase project URL is always https. Tolerate a host pasted without its
 * scheme (a very easy thing to do in a dashboard env-var field) and strip stray
 * whitespace, rather than handing createClient something it cannot use.
 */
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

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const url = normaliseUrl(rawUrl);
const anonKey = rawKey?.trim() || null;

/**
 * Why Supabase is unavailable, phrased so a misconfigured deployment says what
 * is actually wrong instead of showing an unhelpful "not configured". Safe to
 * render: it names variables and the project URL, never a key's value.
 */
export const supabaseConfigError: string | null = (() => {
  const missing: string[] = [];
  if (!rawUrl?.trim()) missing.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    return `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set for this deployment. Note that Vite only reads variables spelled exactly like this, at build time — adding one needs a redeploy.`;
  }
  if (!url) return `VITE_SUPABASE_URL is not a usable URL (got "${rawUrl}").`;
  return null;
})();

/**
 * Null when the client env vars are absent or unusable. Everything auth- and
 * rating-related checks for that and degrades to read-only browsing rather than
 * crashing, so a misconfigured deploy still shows the catalogue and public scores.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = supabase !== null;
