import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/env';

/** Cliente de servidor (RSC, route handlers, server actions). */
export async function getServerSupabase() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie — o middleware renova.
        }
      },
    },
  });
}

/** Usuário autenticado, ou null. */
export async function getCurrentUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** true se o usuário atual está em admin_users. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc('athx_is_admin');
  return data === true;
}
