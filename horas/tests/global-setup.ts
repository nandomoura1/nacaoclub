import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';
import { loadEnv } from 'vite';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string | null;
  }
}

/**
 * Cada execução da suíte ganha um schema Postgres NOVO e vazio, onde as
 * migrations reais são aplicadas com `migrate deploy` (as mesmas da
 * produção, com triggers). Nada existente é apagado; ao final, removemos
 * só o schema que esta execução criou.
 *
 * Sem TEST_DATABASE_URL, os testes de integração são pulados.
 */
export default async function setup(project: TestProject) {
  const base = process.env.TEST_DATABASE_URL ?? loadEnv('test', process.cwd(), '').TEST_DATABASE_URL;
  if (!base) {
    console.warn('\n⚠ TEST_DATABASE_URL não definida: testes de integração serão pulados.\n');
    project.provide('databaseUrl', null);
    return;
  }

  const schema = `vitest_${Date.now()}_${process.pid}`;
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    const prisma = new PrismaClient({ datasourceUrl: base });
    try {
      // Só o schema efêmero criado acima — nome gerado aqui, nunca vindo de fora.
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await prisma.$disconnect();
    }
  };
}
