import { z } from 'zod';

/**
 * Validação de ambiente em ponto único.
 *
 * Regra de segurança: este módulo é SERVER-ONLY. Nenhuma variável aqui
 * pode vazar para o bundle do cliente. Não existe prefixo NEXT_PUBLIC_
 * em nada relacionado à Tecnofit — o frontend nunca fala com a API externa.
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int().positive());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET precisa ter ao menos 16 caracteres'),
  SESSION_TTL_HOURS: int(12),

  TECNOFIT_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  TECNOFIT_API_BASE_URL: z.string().optional().default(''),
  TECNOFIT_API_KEY: z.string().optional().default(''),
  TECNOFIT_API_SECRET: z.string().optional().default(''),
  // 'token-exchange' é o esquema CONFIRMADO da Tecnofit: api_key + api_secret
  // são trocados por um token temporário. Os demais seguem suportados porque
  // o adapter é genérico.
  TECNOFIT_AUTH_SCHEME: z
    .enum(['token-exchange', 'bearer', 'api-key-header', 'basic'])
    .default('token-exchange'),
  TECNOFIT_AUTH_HEADER: z.string().optional().default('X-Api-Key'),
  TECNOFIT_TIMEOUT_MS: int(10_000),
  TECNOFIT_MAX_RETRIES: int(3),
  TECNOFIT_RATE_LIMIT_PER_MINUTE: int(80),

  ACCESS_INGEST_MODE: z.enum(['webhook', 'polling', 'both']).default('polling'),
  TECNOFIT_WEBHOOK_SECRET: z.string().optional().default(''),
  TECNOFIT_WEBHOOK_SIGNATURE_HEADER: z.string().optional().default('x-tecnofit-signature'),
  ACCESS_POLL_INTERVAL_SECONDS: int(20),
  ACCESS_POLL_OVERLAP_SECONDS: int(60),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_DEV_SEED_LOGIN: bool(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}\n\nVeja .env.example.`);
  }

  const env = parsed.data;

  // O provider HTTP exige base URL. Falhar cedo é melhor que falhar em produção.
  if (env.TECNOFIT_PROVIDER === 'http' && !env.TECNOFIT_API_BASE_URL) {
    throw new Error(
      'TECNOFIT_PROVIDER="http" exige TECNOFIT_API_BASE_URL. ' +
        'Confirme o host na documentação oficial antes de configurar.',
    );
  }

  cached = env;
  return env;
}
