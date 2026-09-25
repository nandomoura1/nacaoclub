import { inject } from 'vitest';

// Roda antes de cada arquivo de teste — antes de qualquer import do Prisma.
const url = inject('databaseUrl');
process.env.DATABASE_URL = url ?? '';
