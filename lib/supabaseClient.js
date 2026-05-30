import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

function createSupabaseClient() {
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

// One browser client (avoids duplicate GoTrueClient warnings during Next.js HMR)
const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.__altasSupabase ?? createSupabaseClient();

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.__altasSupabase = supabase;
}
