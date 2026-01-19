import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client for API routes.
 * 
 * Uses server-only environment variables (without NEXT_PUBLIC_ prefix)
 * which are read at runtime, not build time. This is more reliable for
 * deployments using GitHub secrets or other runtime configuration.
 * 
 * Falls back to NEXT_PUBLIC_ vars for backwards compatibility.
 */
export function createServerSupabaseClient() {
    // Prefer server-only env vars (runtime), fallback to NEXT_PUBLIC_ (build-time)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error(
            'Missing Supabase environment variables! ' +
            'Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents).'
        )
    }

    return createClient(supabaseUrl, supabaseAnonKey)
}

// Lazy-initialized singleton for server-side use
let serverSupabase: ReturnType<typeof createServerSupabaseClient> | null = null

export function getServerSupabase() {
    if (!serverSupabase) {
        serverSupabase = createServerSupabaseClient()
    }
    return serverSupabase!
}
