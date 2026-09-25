/**
 * Seed de demonstração — idempotente (pode rodar quantas vezes quiser).
 *
 * Áreas e coordenadores são os reais da Nação (docs/05 §5). Senhas e
 * e-mails são de DEMONSTRAÇÃO: nunca rode este seed em produção.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { bootstrapStructure } from '../src/server/services/bootstrap';
import { loadPrincipal } from '../src/server/auth/principal';
import { createSlots } from '../src/server/services/schedule-service';
import { decideHoliday, generatePeriod } from '../src/server/services/period-service';

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

  await seedDemoSchedule();

  console.log(`✔ Seed aplicado. Usuários de demonstração com senha "${DEMO_PASSWORD}":`);
  for (const u of USERS) console.log(`   ${u.role.padEnd(12)} ${u.email}`);
}

/**
 * Grade do briefing (§39) e a competência Setembro/2026 (26/08–25/09) gerada.
 * Faltas, substituições, férias e aula extra chegam com a etapa E5.
 */
async function seedDemoSchedule() {
  if (await prisma.teacher.findFirst({ where: { name: 'Rafael (demo)' } })) return;
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@nacaoclub.dev' } });
  const admin = (await loadPrincipal(prisma, adminUser.id))!;
  const meta = { ipAddress: '127.0.0.1', userAgent: 'seed' };

  const mod = async (name: string) => (await prisma.modality.findUniqueOrThrow({ where: { name } })).id;
  const [hyrox, crossfit, funcional] = await Promise.all([mod('HYROX'), mod('CrossFit'), mod('Funcional')]);
  const aula = (await prisma.activityType.findUniqueOrThrow({ where: { name: 'Aula' } })).id;
  const space = async (name: string) => (await prisma.space.findUniqueOrThrow({ where: { name } })).id;

  const teacher = (name: string, displayName: string, modalityIds: string[]) =>
    prisma.teacher.create({ data: { name, displayName, modalities: { create: modalityIds.map((modalityId) => ({ modalityId })) } } });
  const rafael = await teacher('Rafael (demo)', 'Rafael', [hyrox, funcional]);
  const eliseu = await teacher('Eliseu (demo)', 'Eliseu', [crossfit]);
  await teacher('João (demo)', 'João', [crossfit, hyrox]);

  const slot = async (weekday: number, startMin: number, modalityId: string, teacherId: string, spaceName: string) =>
    createSlots(admin, {
      weekdays: [weekday], startMin, durationMin: 60, modalityId, activityTypeId: aula, spaceId: await space(spaceName),
      label: '', people: [{ teacherId, role: 'TITULAR' }], validFrom: '2026-08-01',
    }, meta);
  await slot(1, 300, hyrox, rafael.id, 'Funcional 1');   // Segunda 05:00 HYROX Rafael
  await slot(1, 300, crossfit, eliseu.id, 'CrossFit 1'); // Segunda 05:00 CrossFit Eliseu
  await slot(3, 360, funcional, rafael.id, 'Funcional 1'); // Quarta 06:00 Funcional Rafael

  // 07/09 (Independência) vem com "decidir aula por aula":
  // HYROX cancelada, CrossFit mantida — como no mês de demonstração (docs/03 §10).
  await generatePeriod(admin, { year: 2026, month: 9 }, meta);
  const areaOf = async (id: string) => (await prisma.modality.findUniqueOrThrow({ where: { id } })).areaId;
  await decideHoliday(admin, '2026-09-07', 'CANCELAR', await areaOf(hyrox), meta);
  await decideHoliday(admin, '2026-09-07', 'MANTER', await areaOf(crossfit), meta);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
