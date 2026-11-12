/**
 * Endereço público do app para o servidor chamar a si mesmo (continuar a sincronização).
 * Prefere o domínio de produção: o endereço do deploy (*.vercel.app de cada versão) pode estar
 * protegido por login da Vercel e a chamada voltaria 401.
 */
export function selfBaseUrl(fallback?: string | null): string | null {
  const v = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || fallback || '';
  return v ? v.replace(/\/+$/, '') : null;
}
