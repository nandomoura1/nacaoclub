import { PrismaClient } from '@prisma/client';

/**
 * Instância única do Prisma. Em desenvolvimento o hot reload do Next
 * recria módulos; sem o cache global isso vaza conexões até estourar o pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
