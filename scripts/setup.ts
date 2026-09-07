/**
 * ============================================================
 * SETUP DE UM COMANDO
 * ============================================================
 *
 *   npm run setup
 *
 * Leva de "acabei de clonar" a "pronto para npm run dev", sem exigir que
 * ninguém decore a ordem dos passos ou lembre de colar o segredo de sessão.
 *
 * É idempotente: rodar de novo não estraga nada. Um .env existente é
 * preservado — só completamos o que estiver faltando.
 */
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

const RAIZ = process.cwd();
const ENV = path.join(RAIZ, '.env');
const EXEMPLO = path.join(RAIZ, '.env.example');

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amarelo = (s: string) => `\x1b[33m${s}\x1b[0m`;
const negrito = (s: string) => `\x1b[1m${s}\x1b[0m`;

const passo = (n: number, t: string) => console.log(negrito(`\n[${n}/5] ${t}`));
const ok = (s: string) => console.log(`  ${verde('✓')} ${s}`);
const info = (s: string) => console.log(`  ${amarelo('·')} ${s}`);
const falha = (s: string) => console.log(`  ${vermelho('✗')} ${s}`);

function tentar(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function rodar(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}

function portaResponde(porta: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const fim = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(1000);
    s.once('connect', () => fim(true));
    s.once('timeout', () => fim(false));
    s.once('error', () => fim(false));
    s.connect(porta, host);
  });
}

function lerEnv(): Record<string, string> {
  if (!existsSync(ENV)) return {};
  const out: Record<string, string> = {};
  for (const linha of readFileSync(ENV, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]!] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
  return out;
}

function definirNoEnv(chave: string, valor: string): void {
  let texto = readFileSync(ENV, 'utf8');
  const re = new RegExp(`^${chave}=.*$`, 'm');
  texto = re.test(texto) ? texto.replace(re, `${chave}="${valor}"`) : `${texto.trimEnd()}\n${chave}="${valor}"\n`;
  writeFileSync(ENV, texto);
}

async function esperarBanco(host: string, porta: number, segundos: number): Promise<boolean> {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    if (await portaResponde(porta, host)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log(negrito('\n═══ SETUP — NAÇÃO | QUEM CHEGOU? ═══'));

  // ---------- 1. Node ----------
  passo(1, 'Verificando o Node');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    falha(`Node ${process.versions.node} — o projeto exige 20.11 ou superior.`);
    process.exit(1);
  }
  ok(`Node v${process.versions.node}`);

  // ---------- 2. .env ----------
  passo(2, 'Preparando o .env');
  if (!existsSync(ENV)) {
    if (!existsSync(EXEMPLO)) {
      falha('.env.example não encontrado — você está na raiz do projeto?');
      process.exit(1);
    }
    copyFileSync(EXEMPLO, ENV);
    ok('.env criado a partir de .env.example');
  } else {
    info('.env já existe — preservado');
  }

  const env = lerEnv();
  const segredo = env.SESSION_SECRET ?? '';
  // Trocamos o valor de exemplo por um real. Um segredo previsível em
  // desenvolvimento vira, cedo ou tarde, um segredo previsível em produção.
  if (!segredo || segredo.length < 16 || /troque-me/i.test(segredo)) {
    definirNoEnv('SESSION_SECRET', randomBytes(32).toString('hex'));
    ok('SESSION_SECRET gerado (32 bytes aleatórios)');
  } else {
    info('SESSION_SECRET já definido — preservado');
  }

  if (!env.DATABASE_URL) {
    definirNoEnv(
      'DATABASE_URL',
      'postgresql://nacao:nacao@localhost:5432/nacao_relationship?schema=public',
    );
    ok('DATABASE_URL definida com o padrão do docker-compose');
  }

  const dbUrl = lerEnv().DATABASE_URL!;
  let host = '127.0.0.1';
  let porta = 5432;
  try {
    const u = new URL(dbUrl);
    host = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname;
    porta = Number(u.port || 5432);
  } catch {
    falha(`DATABASE_URL inválida: ${dbUrl}`);
    process.exit(1);
  }

  // ---------- 3. Banco ----------
  passo(3, 'Subindo o banco');
  if (await portaResponde(porta, host)) {
    ok(`Já existe algo respondendo em ${host}:${porta}`);
  } else {
    const daemon = tentar('docker info --format "{{.ServerVersion}}"');
    if (!daemon) {
      falha('Nada em ' + `${host}:${porta}` + ' e o Docker não está disponível.');
      console.log(`
  Escolha um caminho:

  ${negrito('A) Com Docker')} — abra o Docker Desktop (ou: sudo systemctl start docker),
     depois rode novamente: npm run setup

  ${negrito('B) Com PostgreSQL próprio')} — crie a base e ajuste a DATABASE_URL no .env:
     createdb nacao_relationship
`);
      process.exit(1);
    }

    info('Subindo o PostgreSQL via docker compose…');
    if (!rodar('docker', ['compose', 'up', '-d', '--wait'])) {
      falha('docker compose falhou. Veja o log: docker compose logs db');
      process.exit(1);
    }

    if (!(await esperarBanco(host, porta, 60))) {
      falha('O banco subiu mas não respondeu em 60s. Veja: docker compose logs db');
      process.exit(1);
    }
    ok('PostgreSQL no ar');
  }

  // ---------- 4. Schema ----------
  passo(4, 'Aplicando schema e dados de desenvolvimento');
  process.env.DATABASE_URL = dbUrl;

  if (!existsSync(path.join(RAIZ, 'node_modules/.prisma/client'))) {
    info('Gerando o Prisma Client…');
    if (!rodar('npx', ['prisma', 'generate'])) {
      falha('prisma generate falhou.');
      process.exit(1);
    }
  }

  if (!rodar('npx', ['prisma', 'migrate', 'deploy'])) {
    falha('As migrations falharam. Confira a DATABASE_URL e se o banco existe.');
    process.exit(1);
  }
  ok('Migrations aplicadas');

  if (!rodar('npx', ['tsx', '--env-file-if-exists=.env', 'prisma/seed.ts'])) {
    falha('O seed falhou.');
    process.exit(1);
  }

  // ---------- 5. Pronto ----------
  passo(5, 'Tudo pronto');
  console.log(`
  ${verde('Rode agora:')}  npm run dev
  ${verde('Abra:')}        http://localhost:3000

  ${negrito('Entre como PROFESSOR')} — é o login que mostra o controle de
  permissão funcionando (ele enxerga 2 das 6 catracas):

    professor@nacaoclub.dev   nacao@2026
    gestor@nacaoclub.dev      nacao@2026
    admin@nacaoclub.dev       nacao@2026

  Algo deu errado depois?  npm run doctor
`);
}

main().catch((e) => {
  console.error(vermelho('\nO setup falhou:'), e);
  process.exit(1);
});
