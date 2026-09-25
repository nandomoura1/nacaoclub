/**
 * Seed de demonstração — idempotente (pode rodar quantas vezes quiser).
 *
 * Áreas e coordenadores são os reais da Nação (docs/05 §5). Senhas e
 * e-mails são de DEMONSTRAÇÃO: nunca rode este seed em produção.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { bootstrapStructure } from '../src/server/services/bootstrap';

const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'nacao@2026';

const USERS: { name: string; email: string; role: string; areas: string[] }[] = [
  { name: 'Administração Nação', email: 'admin@nacaoclub.dev', role: 'ADMIN', areas: [] },
  { name: 'Maria', email: 'maria@nacaoclub.dev', role: 'COORDENADOR', areas: ['Nação Fit'] },
  { name: 'Juliana', email: 'juliana@nacaoclub.dev', role: 'COORDENADOR', areas: ['CrossFit'] },
  { name: 'Rafa', email: 'rafa@nacaoclub.dev', role: 'COORDENADOR', areas: ['Aulas Coletivas'] },
  { name: 'Ramon', email: 'ramon@nacaoclub.dev', role: 'COORDENADOR', areas: ['Futevôlei'] },
  { name: 'DP / Financeiro', email: 'dp@nacaoclub.dev', role: 'CONSULTA', areas: [] },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    throw new Error('Seed de demonstração bloqueado em produção (defina ALLOW_DEMO_SEED=yes se tiver certeza).');
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await prisma.$transaction(async (tx) => {
    await bootstrapStructure(tx);

    const roles = new Map((await tx.role.findMany()).map((r) => [r.key, r.id]));
    const areas = new Map((await tx.coordinationArea.findMany()).map((a) => [a.name, a.id]));

    for (const u of USERS) {
      const user = await tx.user.upsert({
        where: { email: u.email },
        create: { name: u.name, email: u.email, passwordHash },
        update: { name: u.name },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roles.get(u.role)! } },
        create: { userId: user.id, roleId: roles.get(u.role)! },
        update: {},
      });
      for (const areaName of u.areas) {
        const areaId = areas.get(areaName)!;
        await tx.userAreaScope.upsert({
          where: { userId_areaId: { userId: user.id, areaId } },
          create: { userId: user.id, areaId },
          update: {},
        });
      }
    }
  }, { timeout: 60_000 });

  console.log(`✔ Seed aplicado. Usuários de demonstração com senha "${DEMO_PASSWORD}":`);
  for (const u of USERS) console.log(`   ${u.role.padEnd(12)} ${u.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
