import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase project URL is always https. Tolerate a host pasted without its
 * scheme (an easy thing to do in a dashboard env-var field) and strip stray
 * whitespace, rather than handing createClient something it cannot use.
 */
function normaliseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Resolved at build time by vite.config.ts from whichever accepted variable name
 * is set — `VITE_SUPABASE_URL`, `SUPABASE_URL`, and so on — so the app is not
 * tied to one spelling.
 */
const rawUrl = __SUPABASE_URL__;
const rawKey = __SUPABASE_ANON_KEY__;

const url = normaliseUrl(rawUrl);
const anonKey = rawKey.trim() || null;

/** Which variables the build actually read, for the diagnostic banner. */
export const supabaseSources = {
  url: __SUPABASE_URL_SOURCE__ || null,
  key: __SUPABASE_KEY_SOURCE__ || null,
};

/**
 * Why Supabase is unavailable, phrased so a misconfigured deployment says what
 * is actually wrong instead of showing an unhelpful "not configured". Safe to
 * render: it names variables and the project URL, never a key's value.
 */
export const supabaseConfigError: string | null = (() => {
  const missing: string[] = [];
  if (!rawUrl.trim()) missing.push('a Supabase URL (VITE_SUPABASE_URL or SUPABASE_URL)');
  if (!anonKey) missing.push('an anon key (VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY)');
  if (missing.length > 0) {
    return `this deployment was built without ${missing.join(' and ')}. These are read at build time, so adding them needs a redeploy.`;
  }
  if (!url) return `the Supabase URL is not usable (got "${rawUrl}").`;
  return null;
})();

/**
 * Null when the client credentials are absent or unusable. Everything auth- and
 * rating-related checks for that and degrades to read-only browsing rather than
 * crashing, so a misconfigured deploy still shows the catalogue and public scores.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = supabase !== null;
