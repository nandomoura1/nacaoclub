import { z } from 'zod';

/**
 * Variáveis de ambiente.
 *
 * MODO DEMO: com NEXT_PUBLIC_DEMO_MODE=true a aplicação roda inteira sem
 * banco, com 20 duplas fictícias. É assim que se avalia o produto antes de
 * criar o projeto no Supabase (§54).
 *
 * As variáveis são lidas literalmente (process.env.X) e não por índice —
 * o Next.js substitui NEXT_PUBLIC_* em tempo de build por correspondência
 * textual exata.
 */

const truthy = new Set(['true', '1', 'yes', 'on']);

export const IS_DEMO = truthy.has(String(process.env.NEXT_PUBLIC_DEMO_MODE ?? '').toLowerCase());

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const supabaseSchema = z.object({
  url: z.string().url('NEXT_PUBLIC_SUPABASE_URL precisa ser uma URL válida'),
  anonKey: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY ausente ou inválida'),
});

export type SupabaseEnv = z.infer<typeof supabaseSchema>;

/**
 * Config do Supabase. Só é exigida fora do modo demo — por isso a validação
 * é preguiçosa: `npm run build` não pode quebrar por falta de banco.
 */
export function getSupabaseEnv(): SupabaseEnv {
  const parsed = supabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    const detalhes = parsed.error.issues.map((i) => i.message).join('; ');
    throw new Error(
      `Supabase não configurado: ${detalhes}. ` +
        'Defina as variáveis no .env.local ou ligue NEXT_PUBLIC_DEMO_MODE=true para usar dados fictícios.',
    );
  }
  return parsed.data;
}

export function isSupabaseConfigured(): boolean {
  return supabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}

/** Slug do evento desta edição. */
export const EVENT_SLUG = 'nacao-celebration-setembro-amarelo';
