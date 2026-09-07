/**
 * ============================================================
 * DIAGNÓSTICO DE AMBIENTE
 * ============================================================
 *
 *   npm run doctor
 *
 * Verifica, em ordem de dependência, tudo que precisa estar de pé para o
 * sistema rodar — e, quando algo falha, diz exatamente o comando que
 * resolve. Não importa `@/lib/env`: se a configuração estiver quebrada,
 * o próprio diagnóstico quebraria junto, que é justamente o problema que
 * ele existe para explicar.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const RAIZ = process.cwd();

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amarelo = (s: string) => `\x1b[33m${s}\x1b[0m`;
const negrito = (s: string) => `\x1b[1m${s}\x1b[0m`;

type Estado = 'ok' | 'erro' | 'aviso';

interface Resultado {
  nome: string;
  estado: Estado;
  detalhe: string;
  correcao?: string;
}

const resultados: Resultado[] = [];

function registrar(nome: string, estado: Estado, detalhe: string, correcao?: string) {
  resultados.push({ nome, estado, detalhe, correcao });
  const icone = estado === 'ok' ? verde('✓') : estado === 'erro' ? vermelho('✗') : amarelo('!');
  console.log(`  ${icone} ${nome.padEnd(26)} ${detalhe}`);
  if (correcao && estado !== 'ok') console.log(`      ${amarelo('→')} ${correcao}`);
}

function comando(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

/** Lê o .env sem depender de nenhuma biblioteca nem da validação da app. */
function lerEnv(): Record<string, string> {
  const arquivo = path.join(RAIZ, '.env');
  if (!existsSync(arquivo)) return {};
  const out: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return out;
}

function portaOcupada(porta: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const encerrar = (ocupada: boolean) => {
      socket.destroy();
      resolve(ocupada);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => encerrar(true));
    socket.once('timeout', () => encerrar(false));
    socket.once('error', () => encerrar(false));
    socket.connect(porta, host);
  });
}

async function main() {
  console.log(negrito('\n═══ DIAGNÓSTICO — NAÇÃO | QUEM CHEGOU? ═══\n'));

  // ---------- 1. Node ----------
  console.log(negrito('1. Ferramentas'));
  const major = Number(process.versions.node.split('.')[0]);
  registrar(
    'Node.js',
    major >= 20 ? 'ok' : 'erro',
    `v${process.versions.node}`,
    major >= 20 ? undefined : 'O projeto exige Node 20.11 ou superior. Atualize o Node.',
  );

  // O Docker só é avaliado depois de sabermos se o banco já responde:
  // ele é um caminho para subir o Postgres, não um requisito do projeto.
  // Acusar erro de Docker com o banco no ar mandaria você caçar fantasma.
  const temDocker = comando('docker --version');
  const dockerVivo = temDocker ? comando('docker info --format "{{.ServerVersion}}"') : null;

  // ---------- 2. Dependências ----------
  console.log(negrito('\n2. Projeto'));
  const temModules = existsSync(path.join(RAIZ, 'node_modules'));
  registrar('node_modules', temModules ? 'ok' : 'erro', temModules ? 'instalado' : 'ausente', temModules ? undefined : 'npm install');

  const temPrismaClient = existsSync(path.join(RAIZ, 'node_modules/.prisma/client'));
  registrar(
    'Prisma Client',
    temPrismaClient ? 'ok' : 'erro',
    temPrismaClient ? 'gerado' : 'não gerado',
    temPrismaClient ? undefined : 'npm run db:generate',
  );

  // ---------- 3. Configuração ----------
  console.log(negrito('\n3. Configuração (.env)'));
  const temEnv = existsSync(path.join(RAIZ, '.env'));
  registrar('arquivo .env', temEnv ? 'ok' : 'erro', temEnv ? 'existe' : 'ausente', temEnv ? undefined : 'npm run setup   (cria e preenche automaticamente)');

  const env = lerEnv();

  const segredo = env.SESSION_SECRET ?? '';
  const segredoPlaceholder = /troque-me|^$|^dev-secret/i.test(segredo);
  registrar(
    'SESSION_SECRET',
    !segredo ? 'erro' : segredoPlaceholder ? 'erro' : segredo.length < 16 ? 'erro' : 'ok',
    !segredo
      ? 'não definido'
      : segredoPlaceholder
        ? 'ainda é o valor de exemplo'
        : segredo.length < 16
          ? `curto demais (${segredo.length} caracteres, mínimo 16)`
          : `definido (${segredo.length} caracteres)`,
    !segredo || segredoPlaceholder || segredo.length < 16
      ? 'Gere um: openssl rand -hex 32   e cole em SESSION_SECRET no .env\n        (ou rode: npm run setup)'
      : undefined,
  );

  const dbUrl = env.DATABASE_URL ?? '';
  registrar(
    'DATABASE_URL',
    dbUrl ? 'ok' : 'erro',
    dbUrl ? dbUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@') : 'não definida',
    dbUrl ? undefined : 'Copie de .env.example e ajuste para o seu banco.',
  );

  const provider = env.TECNOFIT_PROVIDER || 'mock';
  registrar(
    'TECNOFIT_PROVIDER',
    provider === 'mock' ? 'ok' : 'aviso',
    provider,
    provider === 'http'
      ? 'Modo API real. Exige base URL e o path de authToken — veja docs/tecnofit-integration.md.'
      : undefined,
  );

  // ---------- 4. Banco ----------
  console.log(negrito('\n4. Banco de dados'));
  let porta = 5432;
  let host = '127.0.0.1';
  try {
    if (dbUrl) {
      const u = new URL(dbUrl);
      porta = Number(u.port || 5432);
      host = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname;
    }
  } catch {
    // URL malformada já foi sinalizada acima.
  }

  const dbNoAr = await portaOcupada(porta, host);

  if (dbNoAr) {
    registrar('Docker', dockerVivo ? 'ok' : 'aviso', dockerVivo ? `daemon ativo (${dockerVivo})` : 'não disponível — mas o banco já está no ar, então tudo bem');
  } else if (!temDocker) {
    registrar('Docker', 'aviso', 'não encontrado', 'Sem Docker você precisa de um PostgreSQL 16 próprio e da DATABASE_URL apontando para ele.');
  } else if (!dockerVivo) {
    registrar('Docker', 'erro', 'instalado, mas o daemon não responde', 'Abra o Docker Desktop (ou: sudo systemctl start docker) e rode de novo.');
  } else {
    registrar('Docker', 'ok', `daemon ativo (${dockerVivo})`);
  }

  registrar(
    `porta ${porta} (${host})`,
    dbNoAr ? 'ok' : 'erro',
    dbNoAr ? 'algo respondendo' : 'nada respondendo',
    dbNoAr ? undefined : 'docker compose up -d --wait      (ou suba seu PostgreSQL)',
  );

  if (dbNoAr && temPrismaClient && dbUrl) {
    // Consulta pelo Prisma Client, não pelo shell: `prisma db execute --stdin`
    // depende de here-string do bash, que o execSync (/bin/sh) não entende —
    // e o diagnóstico acabava acusando falha onde não havia nenhuma.
    let conectou = false;
    let usuarios: number | null = null;
    let faltaTabela = false;

    try {
      const { PrismaClient } = (await import('@prisma/client')) as typeof import('@prisma/client');
      const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        conectou = true;
        try {
          usuarios = await prisma.user.count();
        } catch {
          // Conectou mas a tabela não existe: schema ainda não aplicado.
          faltaTabela = true;
        }
      } finally {
        await prisma.$disconnect();
      }
    } catch (err) {
      registrar(
        'conexão',
        'erro',
        `falhou — ${(err as Error).message.split('\n')[0]?.slice(0, 70)}`,
        'Confira usuário, senha e nome da base na DATABASE_URL.\n        Com Docker: docker compose logs db',
      );
    }

    if (conectou) {
      registrar('conexão', 'ok', 'autenticou e respondeu');
      registrar(
        'migrations',
        faltaTabela ? 'erro' : 'ok',
        faltaTabela ? 'schema não aplicado' : 'schema presente',
        faltaTabela ? 'npm run db:migrate' : undefined,
      );
      if (!faltaTabela) {
        registrar(
          'seed',
          (usuarios ?? 0) > 0 ? 'ok' : 'erro',
          `${usuarios ?? 0} usuário(s) cadastrado(s)`,
          (usuarios ?? 0) > 0 ? undefined : 'npm run db:seed',
        );
      }
    }
  }

  // ---------- 5. Porta da aplicação ----------
  console.log(negrito('\n5. Aplicação'));
  const p3000 = await portaOcupada(3000);
  registrar(
    'porta 3000',
    p3000 ? 'aviso' : 'ok',
    p3000 ? 'já ocupada' : 'livre',
    p3000 ? 'Outro processo está na 3000. Encerre-o, ou rode: npx next dev -p 3001' : undefined,
  );

  // ---------- Veredito ----------
  const erros = resultados.filter((r) => r.estado === 'erro');
  console.log(negrito('\n═══ RESULTADO ═══\n'));

  if (erros.length === 0) {
    console.log(verde('  Ambiente pronto.') + '  Rode:  npm run dev');
    console.log('\n  Login:  professor@nacaoclub.dev  /  nacao@2026\n');
    return;
  }

  console.log(vermelho(`  ${erros.length} problema(s) impedindo a execução:\n`));
  erros.forEach((e, i) => {
    console.log(`  ${i + 1}. ${negrito(e.nome)} — ${e.detalhe}`);
    if (e.correcao) console.log(`     ${e.correcao}`);
  });
  console.log(
    '\n  ' + amarelo('Atalho:') + ' `npm run setup` resolve .env, banco, migrations e seed de uma vez.\n',
  );
  process.exitCode = 1;
}

main().catch((e) => {
  console.error('\nO diagnóstico falhou:', e);
  process.exit(1);
});
