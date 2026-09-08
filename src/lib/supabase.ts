import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Null when the client env vars are absent. Everything auth- and rating-related
 * checks for that and degrades to read-only browsing rather than crashing, so a
 * misconfigured preview deploy still shows the catalogue and public scores.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = supabase !== null;
