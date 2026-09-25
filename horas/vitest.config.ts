import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      // Integração usa um banco real e único: arquivos em série.
      fileParallelism: false,
      globalSetup: ['tests/global-setup.ts'],
      setupFiles: ['tests/setup-env.ts'],
      env: {
        ...env,
        NODE_ENV: 'test',
        // Os testes NUNCA tocam o banco de desenvolvimento: DATABASE_URL é
        // trocada por um schema efêmero em tests/setup-env.ts.
        DATABASE_URL: '',
        SESSION_SECRET: env.SESSION_SECRET || 'x'.repeat(64),
      },
      testTimeout: 20_000,
      hookTimeout: 60_000,
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  };
});
