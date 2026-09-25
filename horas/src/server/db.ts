import { PrismaClient } from '@prisma/client';

/**
 * Um único PrismaClient por processo. Em dev o hot reload recriaria o
 * cliente a cada edição e esgotaria as conexões — por isso o cache global.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
