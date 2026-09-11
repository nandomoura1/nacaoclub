import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/env';

/**
 * Cliente com service role — ignora RLS.
 *
 * SÓ para scripts de manutenção no servidor. O arquivo é `server-only`: se
 * alguém importar em um componente de cliente, o build quebra na hora. A
 * chave nunca tem prefixo NEXT_PUBLIC_ (§35).
 */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não definida. Use apenas no servidor.');
  }
  const { url } = getSupabaseEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}
