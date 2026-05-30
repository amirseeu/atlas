/** Keys exposed to the browser (injected from server env at request time on Cloud Run). */
export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
];

export function getPublicEnv(name) {
  if (typeof window !== 'undefined' && window.__ATLAS_ENV__?.[name]) {
    return window.__ATLAS_ENV__[name];
  }
  return process.env[name];
}

/** Snapshot for embedding in layout (reads Cloud Run / container env at runtime). */
export function getRuntimeEnvSnapshot() {
  return Object.fromEntries(
    PUBLIC_ENV_KEYS.map((key) => [key, process.env[key] ?? '']),
  );
}
