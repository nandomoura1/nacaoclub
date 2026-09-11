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
  // required_error é o que aparece quando a variável não existe. Sem ele, o
  // Zod diria apenas "Required" e a mensagem na tela não diria QUAL variável
  // está faltando — inútil para quem está configurando a Vercel.
  url: z
    .string({ required_error: 'falta NEXT_PUBLIC_SUPABASE_URL' })
    .url('NEXT_PUBLIC_SUPABASE_URL não é uma URL válida'),
  anonKey: z
    .string({ required_error: 'falta NEXT_PUBLIC_SUPABASE_ANON_KEY' })
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY parece incompleta'),
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
        'Na Vercel: Settings > Environment Variables (e depois Redeploy). ' +
        'No seu computador: arquivo .env.local. ' +
        'Para avaliar sem banco, use NEXT_PUBLIC_DEMO_MODE=true.',
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
