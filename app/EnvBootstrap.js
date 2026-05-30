'use client';

import { useEffect, useState } from 'react';
function hasRequiredEnv() {
  if (typeof window === 'undefined') return false;
  const env = window.__ATLAS_ENV__;
  return Boolean(
    env?.NEXT_PUBLIC_SUPABASE_URL && env?.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export default function EnvBootstrap({ children }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (hasRequiredEnv()) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Config request failed (${res.status})`);
        const env = await res.json();
        if (cancelled) return;

        window.__ATLAS_ENV__ = { ...window.__ATLAS_ENV__, ...env };

        if (!hasRequiredEnv()) {
          setError(
            'Server is missing Supabase env vars. In Google Cloud Run → your service → Edit → Container → Variables, add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then deploy.',
          );
          return;
        }

        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load configuration');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <p className="text-red-400 text-sm max-w-md text-center">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return children;
}
