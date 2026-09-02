import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { HttpTecnofitProvider } from './http-provider';
import { MockTecnofitProvider } from './mock-provider';
import type { TecnofitProvider } from './types';

export * from './types';

let provider: TecnofitProvider | null = null;

/**
 * Ponto único de acesso à integração.
 *
 * Nenhum service de domínio instancia provider diretamente — todos passam
 * por aqui. É o que permite trocar mock por HTTP com uma variável de ambiente.
 */
export function getTecnofitProvider(): TecnofitProvider {
  if (provider) return provider;

  const env = getEnv();
  provider = env.TECNOFIT_PROVIDER === 'http' ? new HttpTecnofitProvider() : new MockTecnofitProvider();

  logger.info('Provider Tecnofit inicializado', { provider: provider.name });
  return provider;
}

/** Para testes: injeta um provider e devolve a função de restauração. */
export function setTecnofitProviderForTesting(p: TecnofitProvider | null): void {
  provider = p;
}
