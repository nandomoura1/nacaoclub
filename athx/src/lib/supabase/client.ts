'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/env';

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente do browser. Usa APENAS a anon key — toda autorização vive no RLS.
 * A service role key nunca chega aqui (§35).
 */
export function getBrowserSupabase() {
  if (cached) return cached;
  const { url, anonKey } = getSupabaseEnv();
  cached = createBrowserClient(url, anonKey);
  return cached;
}
