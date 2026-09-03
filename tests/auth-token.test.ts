import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENDPOINT_MAP, loadEndpointMap } from '@/server/tecnofit/endpoint-map';

/**
 * Fluxo de autenticação da Tecnofit.
 *
 * CONFIRMADO pelo painel: api_key + api_secret são trocados por um token
 * de acesso TEMPORÁRIO. Isso muda tudo em relação a uma chave estática:
 * o token precisa ser cacheado (senão gastamos uma autenticação por
 * chamada e estouramos o rate limit), renovado antes de expirar, e várias
 * chamadas simultâneas não podem disparar N autenticações.
 */

const BASE = 'https://api.exemplo.test';

// Mapa com o endpoint de auth preenchido, simulando a configuração que o
// cliente fará quando tiver a documentação em mãos.
const MAP = {
  ...DEFAULT_ENDPOINT_MAP,
  paths: {
    ...DEFAULT_ENDPOINT_MAP.paths,
    authToken: { path: 'auth/token', method: 'POST' as const },
    listAccessPoints: { path: 'access-points', method: 'GET' as const },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
let authCalls: number;

async function importClient() {
  const mod = await import('@/server/tecnofit/http-client');
  mod.__resetClient();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  authCalls = 0;

  process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
  process.env.TECNOFIT_PROVIDER = 'http';
  process.env.TECNOFIT_API_BASE_URL = BASE;
  process.env.TECNOFIT_API_KEY = 'pk_tf_teste';
  process.env.TECNOFIT_API_SECRET = 'sk_tf_teste';
  process.env.TECNOFIT_AUTH_SCHEME = 'token-exchange';
  process.env.TECNOFIT_MAX_RETRIES = '1';
  process.env.LOG_LEVEL = 'error';

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respostaAuth(token: string, extra: Record<string, unknown> = {}) {
  authCalls++;
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ access_token: token, ...extra }),
  };
}

function respostaOk(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body };
}

function resposta(status: number) {
  return { ok: false, status, headers: new Headers(), json: async () => ({}) };
}

describe('troca de credenciais por token', () => {
  it('envia api_key e api_secret no corpo, com os nomes do painel Tecnofit', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('tok-1', { expires_in: 3600 });
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);

    const chamadaAuth = fetchMock.mock.calls.find((c) => String(c[0]).includes('auth/token'));
    expect(chamadaAuth).toBeDefined();

    const corpo = JSON.parse(chamadaAuth![1].body as string);
    expect(corpo).toEqual({ api_key: 'pk_tf_teste', api_secret: 'sk_tf_teste' });
    expect(chamadaAuth![1].method).toBe('POST');
  });

  it('usa o token obtido como Bearer na chamada seguinte', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('tok-abc', { expires_in: 3600 });
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);

    const chamadaRecurso = fetchMock.mock.calls.find((c) => String(c[0]).includes('access-points'));
    expect(chamadaRecurso![1].headers.Authorization).toBe('Bearer tok-abc');
  });

  it('reaproveita o token entre chamadas — não autentica de novo', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('tok-1', { expires_in: 3600 });
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);
    await tecnofitRequest({ path: 'access-points' }, MAP);
    await tecnofitRequest({ path: 'access-points' }, MAP);

    // Uma autenticação para três chamadas. Sem isso, o rate limit de
    // 100 req/min seria consumido pela metade só em autenticação.
    expect(authCalls).toBe(1);
  });

  it('deduplica autenticação quando várias chamadas partem ao mesmo tempo', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) {
        authCalls++;
        // Latência real: é durante ela que a corrida aconteceria.
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ access_token: 'tok-1', expires_in: 3600 }) };
      }
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await Promise.all([
      tecnofitRequest({ path: 'access-points' }, MAP),
      tecnofitRequest({ path: 'access-points' }, MAP),
      tecnofitRequest({ path: 'access-points' }, MAP),
    ]);

    expect(authCalls).toBe(1);
  });

  it('renova o token quando ele expira', async () => {
    let tokenAtual = 'tok-curto';
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) {
        authCalls++;
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ access_token: tokenAtual, expires_in: 1 }) };
      }
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);
    expect(authCalls).toBe(1);

    // expires_in de 1s, menos a margem de 60s, resulta num piso de 30s.
    // Avançamos o relógio além disso para forçar a renovação.
    const agora = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(agora + 60_000);

    tokenAtual = 'tok-novo';
    await tecnofitRequest({ path: 'access-points' }, MAP);
    expect(authCalls).toBe(2);

    const ultima = fetchMock.mock.calls.filter((c) => String(c[0]).includes('access-points')).pop();
    expect(ultima![1].headers.Authorization).toBe('Bearer tok-novo');
    vi.restoreAllMocks();
  });

  it('renova e repete uma vez quando o recurso responde 401', async () => {
    let primeiroRecurso = true;
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth(`tok-${authCalls + 1}`, { expires_in: 3600 });
      if (primeiroRecurso) {
        primeiroRecurso = false;
        // Token revogado antes de expirar: cenário real, não hipotético.
        return resposta(401);
      }
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest } = await importClient();
    await expect(tecnofitRequest({ path: 'access-points' }, MAP)).resolves.toBeDefined();
    expect(authCalls).toBe(2);
  });

  it('não entra em laço infinito se o 401 persistir', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('tok', { expires_in: 3600 });
      return resposta(401);
    });

    const { tecnofitRequest } = await importClient();
    await expect(tecnofitRequest({ path: 'access-points' }, MAP)).rejects.toThrow();
    // Uma renovação, e só.
    expect(authCalls).toBe(2);
  });

  it('aplica TTL conservador quando a API não informa validade', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('tok-sem-ttl');
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest, tokenStatus } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);

    const status = tokenStatus();
    expect(status.cached).toBe(true);
    // fallbackTtlSeconds (600) menos a margem de 60s.
    expect(status.expiresInSeconds).toBeGreaterThan(0);
    expect(status.expiresInSeconds).toBeLessThanOrEqual(540);
  });

  it('recusa a chamada quando o endpoint de auth não está configurado', async () => {
    const { tecnofitRequest } = await importClient();
    await expect(
      tecnofitRequest({ path: 'access-points' }, DEFAULT_ENDPOINT_MAP),
    ).rejects.toThrow(/não adivinha endpoints|não configurado/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nunca expõe o token no tokenStatus', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => {
      if (String(url).includes('auth/token')) return respostaAuth('token-secretissimo', { expires_in: 3600 });
      return respostaOk({ data: [] });
    });

    const { tecnofitRequest, tokenStatus } = await importClient();
    await tecnofitRequest({ path: 'access-points' }, MAP);
    expect(JSON.stringify(tokenStatus())).not.toContain('token-secretissimo');
  });
});

describe('mapa de autenticação', () => {
  it('usa os nomes de campo confirmados pelo painel Tecnofit', () => {
    const map = loadEndpointMap(undefined);
    expect(map.auth.keyField).toBe('api_key');
    expect(map.auth.secretField).toBe('api_secret');
  });

  it('deixa o path de authToken vazio até a documentação chegar', () => {
    expect(loadEndpointMap(undefined).paths.authToken.path).toBe('');
  });

  it('aceita override do path de auth sem perder o resto do mapa', () => {
    const m = loadEndpointMap(JSON.stringify({ paths: { authToken: { path: 'oauth/token', method: 'POST' } } }));
    expect(m.paths.authToken.path).toBe('oauth/token');
    expect(m.auth.keyField).toBe('api_key');
  });
});
