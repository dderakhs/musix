/// <reference types="vite/client" />

/**
 * Injected by `define` in vite.config.ts. The client's Supabase credentials are
 * resolved at build time from whichever of several accepted variable names is
 * set, so the app reads these constants rather than one hard-coded name.
 */
declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string
/** Which environment variable each value came from, for diagnostics. */
declare const __SUPABASE_URL_SOURCE__: string
declare const __SUPABASE_KEY_SOURCE__: string
