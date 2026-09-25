import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de ao menos 32 caracteres.'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Lê e valida o ambiente uma vez. Falha cedo, com mensagem clara. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Variáveis de ambiente inválidas — ${issues}. Veja .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
