import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Supabase's *browser* credentials can arrive under several names depending on
 * how the project was wired up: hand-written `VITE_` variables, or the names the
 * Vercel Supabase integration injects (`SUPABASE_URL` / `SUPABASE_ANON_KEY`), or
 * the Next-flavoured ones people copy from other projects. Vite only inlines
 * `VITE_`-prefixed variables on its own, so accept all of them here and inline
 * the winner. That removes an easy and near-silent misconfiguration.
 *
 * These two values are public by design — the anon/publishable key is meant to
 * ship to the browser, and row level security is what actually guards the data.
 * The lists below are explicit allowlists: no wildcard, and nothing that could
 * pull in a service-role key.
 */
const URL_VARS = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
const KEY_VARS = [
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

export default defineConfig(({ mode }) => {
  // Empty prefix so .env files can supply the unprefixed names too; real
  // environment variables (what Vercel sets) win over file values.
  const env: Record<string, string | undefined> = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  }

  const pick = (names: string[]) => {
    for (const name of names) {
      const value = env[name]?.trim()
      if (value) return { name, value }
    }
    return null
  }

  const url = pick(URL_VARS)
  const key = pick(KEY_VARS)

  // A service-role key in the browser bundle would hand every visitor full
  // database access, bypassing RLS. Fail the build rather than ship that.
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (key && serviceRole && key.value === serviceRole) {
    throw new Error(
      `${key.name} is set to the Supabase service role key. Refusing to inline it ` +
        `into the client bundle — use the anon/publishable key instead.`,
    )
  }

  // Surfaces in the Vercel build log, so a misconfigured deploy is diagnosable
  // without reading the shipped bundle. Names only; never a value.
  console.log(
    `[musix] client Supabase config: url=${url?.name ?? 'MISSING'} key=${key?.name ?? 'MISSING'}`,
  )

  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(url?.value ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(key?.value ?? ''),
      __SUPABASE_URL_SOURCE__: JSON.stringify(url?.name ?? ''),
      __SUPABASE_KEY_SOURCE__: JSON.stringify(key?.name ?? ''),
    },
  }
})
