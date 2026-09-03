/**
 * ============================================================
 * PROBE DA INTEGRAÇÃO TECNOFIT
 * ============================================================
 *
 * Valida a configuração contra a API REAL sem gravar nada no banco.
 *
 *   npm run tecnofit:probe
 *
 * Responde a três perguntas, nesta ordem:
 *   1. As credenciais e a URL base funcionam?
 *   2. Os paths do EndpointMap existem?
 *   3. O mapeamento de campos casa com o que a API devolve?
 *
 * A terceira é a que costuma pegar: uma resposta 200 com todos os campos
 * caindo em `undefined` significa integração quebrada de forma silenciosa.
 * O probe mostra isso explicitamente.
 */
import { loadEndpointMap } from '../src/server/tecnofit/endpoint-map';
import { tokenStatus } from '../src/server/tecnofit/http-client';
import { getTecnofitProvider } from '../src/server/tecnofit';
import { TecnofitError } from '../src/server/tecnofit/types';

const ok = (s: string) => `  \x1b[32m✓\x1b[0m ${s}`;
const bad = (s: string) => `  \x1b[31m✗\x1b[0m ${s}`;
const warn = (s: string) => `  \x1b[33m!\x1b[0m ${s}`;
const titulo = (s: string) => `\n\x1b[1m${s}\x1b[0m`;

function descreverErro(err: unknown): string {
  if (err instanceof TecnofitError) {
    const dicas: Partial<Record<TecnofitError['kind'], string>> = {
      NOT_CONFIGURED: 'Preencha o path em endpoint-map.ts ou em TECNOFIT_ENDPOINT_MAP.',
      UNAUTHORIZED: 'Verifique TECNOFIT_API_KEY / SECRET e TECNOFIT_AUTH_SCHEME.',
      NOT_FOUND: 'O path existe na documentação? Confira a versão da API.',
      RATE_LIMITED: 'Reduza TECNOFIT_RATE_LIMIT_PER_MINUTE.',
      TIMEOUT: 'Aumente TECNOFIT_TIMEOUT_MS ou verifique a rede.',
    };
    const dica = dicas[err.kind];
    return `${err.kind}: ${err.message}${dica ? `\n      → ${dica}` : ''}`;
  }
  return (err as Error).message;
}

async function main() {
  console.log('\n\x1b[1m═══ PROBE DA INTEGRAÇÃO TECNOFIT ═══\x1b[0m');

  const provider = getTecnofitProvider();
  const map = loadEndpointMap();

  console.log(titulo('1. Configuração'));
  console.log(`  provider : ${provider.name}`);
  console.log(`  auth     : ${process.env.TECNOFIT_AUTH_SCHEME ?? 'token-exchange'}`);
  console.log(`  base URL : ${process.env.TECNOFIT_API_BASE_URL || '(vazia)'}`);
  console.log(`  key      : ${process.env.TECNOFIT_API_KEY ? 'definida' : '(ausente)'}`);
  console.log(`  secret   : ${process.env.TECNOFIT_API_SECRET ? 'definido' : '(ausente)'}`);

  if (provider.name === 'mock') {
    console.log(
      warn('\n  Provider MOCK ativo — nenhuma chamada externa será feita.\n' +
           '  Defina TECNOFIT_PROVIDER="http" para validar a API real.\n'),
    );
  }

  console.log(titulo('2. Paths configurados'));
  let faltando = 0;
  for (const [nome, def] of Object.entries(map.paths)) {
    if (def.path) console.log(ok(`${nome.padEnd(18)} ${def.method} ${def.path}`));
    else {
      faltando++;
      console.log(bad(`${nome.padEnd(18)} não configurado`));
    }
  }
  if (faltando && provider.name === 'http') {
    console.log(
      warn(`\n  ${faltando} endpoint(s) sem path. Consulte a documentação oficial:\n` +
           '  https://api-externa-tecnofit.readme.io\n'),
    );
  }

  console.log(titulo('3. Autenticação (troca de credenciais por token)'));
  if (!map.paths.authToken.path && provider.name === 'http') {
    console.log(bad('paths.authToken não configurado.'));
    console.log(
      '      A Tecnofit troca api_key + api_secret por um token temporário.\n' +
      '      Informe o path desse endpoint antes de qualquer outra chamada.',
    );
  } else if (provider.name === 'http') {
    try {
      // Uma chamada qualquer força a autenticação; o status revela o cache.
      await provider.listAccessPoints();
    } catch {
      // O erro é reportado na etapa do recurso; aqui só queremos o token.
    }
    const st = tokenStatus();
    if (st.cached) {
      console.log(ok(`token obtido e cacheado (válido por ~${st.expiresInSeconds}s)`));
    } else {
      console.log(bad('não foi possível obter token — verifique chaves e path de authToken.'));
    }
  } else {
    console.log(warn('Provider mock: nenhuma autenticação real é feita.'));
  }

  console.log(titulo('4. Conectividade'));
  const health = await provider.healthCheck();
  console.log(health.ok ? ok(health.detail) : bad(health.detail));

  console.log(titulo('5. Pontos de acesso (catracas)'));
  try {
    const pontos = await provider.listAccessPoints();
    console.log(ok(`${pontos.length} ponto(s) retornado(s)`));
    for (const p of pontos.slice(0, 10)) {
      console.log(`      ${p.externalId.padEnd(16)} ${p.name}`);
    }
    if (pontos.length === 0) {
      console.log(warn('Lista vazia. Confira collection.itemsPath no EndpointMap.'));
    }
  } catch (err) {
    console.log(bad(descreverErro(err)));
  }

  console.log(titulo('6. Eventos de acesso (última hora)'));
  try {
    const since = new Date(Date.now() - 3_600_000);
    const page = await provider.listAccessEvents({ since, limit: 5 });
    console.log(ok(`${page.items.length} evento(s) retornado(s)`));

    const primeiro = page.items[0];
    if (primeiro) {
      // Este bloco é o mais valioso do probe: mostra campo a campo o que
      // o mapeamento conseguiu extrair. Um `undefined` aqui é um mapeamento
      // errado que passaria despercebido em produção.
      console.log('\n      Campos extraídos do primeiro evento:');
      const campos: Array<[string, unknown]> = [
        ['externalEventId', primeiro.externalEventId],
        ['studentExternalId', primeiro.studentExternalId],
        ['accessPointExternalId', primeiro.accessPointExternalId],
        ['accessPointLabel', primeiro.accessPointLabel],
        ['eventType', primeiro.eventType],
        ['occurredAt', primeiro.occurredAt?.toISOString()],
      ];
      for (const [nome, valor] of campos) {
        const marcador = valor === undefined ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
        console.log(`        ${marcador} ${nome.padEnd(22)} ${valor ?? '(não mapeado)'}`);
      }
    } else {
      console.log(
        warn('Nenhum evento na última hora. Isso pode ser normal fora do horário\n' +
             '      de pico, ou indicar mapeamento errado em fields.accessEvent.'),
      );
    }
  } catch (err) {
    console.log(bad(descreverErro(err)));
  }

  console.log(titulo('7. Aluno'));
  try {
    const alunos = await provider.searchStudents('a', 3);
    console.log(ok(`${alunos.length} aluno(s) retornado(s)`));
    const primeiro = alunos[0];
    if (primeiro) {
      console.log('\n      Campos extraídos do primeiro aluno:');
      const campos: Array<[string, unknown]> = [
        ['externalId', primeiro.externalId],
        ['fullName', primeiro.fullName],
        ['photoUrl', primeiro.photoUrl],
        ['status', primeiro.status],
        ['planName', primeiro.planName],
        ['modalities', primeiro.modalities?.join(', ') || undefined],
        ['memberSince', primeiro.memberSince?.toISOString().slice(0, 10)],
        ['planExpiresAt', primeiro.planExpiresAt?.toISOString().slice(0, 10)],
      ];
      for (const [nome, valor] of campos) {
        const marcador = valor === undefined ? '\x1b[33m!\x1b[0m' : '\x1b[32m✓\x1b[0m';
        console.log(`        ${marcador} ${nome.padEnd(22)} ${valor ?? '(não disponível)'}`);
      }
      console.log(
        '\n      Campos com "!" são opcionais: a UI mostra "Não informado".\n' +
        '      Se um deles DEVERIA vir, ajuste fields.student no EndpointMap.',
      );
    }
  } catch (err) {
    console.log(bad(descreverErro(err)));
  }

  console.log('\n\x1b[1m═══ FIM ═══\x1b[0m');
  console.log('Documentação da integração: docs/tecnofit-integration.md\n');
}

main().catch((e) => {
  console.error('\nProbe falhou:', e);
  process.exit(1);
});
