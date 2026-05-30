import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/publicEnv';

function createSupabaseClient() {
  const supabaseUrl = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    const hint =
      typeof window !== 'undefined'
        ? 'Cloud Run → Container → Variables must include NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        : 'Check .env.local locally or Cloud Run runtime variables in production.';
    throw new Error(`Missing Supabase environment variables. ${hint}`);
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

const globalForSupabase = globalThis;

function getSupabaseClient() {
  if (!globalForSupabase.__altasSupabase) {
    globalForSupabase.__altasSupabase = createSupabaseClient();
  }
  return globalForSupabase.__altasSupabase;
}

/** Lazy client so `next build` does not throw when env vars load at Docker build time. */
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  },
);
