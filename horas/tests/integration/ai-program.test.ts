import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createProgram, generateProgramDay, getProgram, insertProgramDays, listPrograms } from '@/server/ai/program-generator';
import { generateWorkout } from '@/server/ai/workout-generator';
import { META, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Planilhas da IA (modo de exemplo local)', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  const prev = process.env.AI_FAKE;
  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('treino do dia aceita janela de 30 dias', async () => {
    const r = await generateWorkout(admin.principal, 'crossfit', { date: '2026-11-04', window: 30 });
    expect(r.check.totalMin).toBe(55);
    await expect(generateWorkout(admin.principal, 'crossfit', { date: '2026-11-04', window: 21 })).rejects.toThrow(/Janela/);
  });

  it('cria a estratégia, gera a aula do dia e lança no Cadastro de Treino', async () => {
    const id = await createProgram(admin.principal, 'crossfit', { kind: 'continuidade', startDate: '2026-11-09', length: 1, unit: 'semanas', weekdays: [1, 3, 5], window: 30 }, META);
    const p = await getProgram(admin.principal, id);
    expect(p.plan.semanas[0]!.dias.map((d) => d.data)).toEqual(['2026-11-09', '2026-11-11', '2026-11-13']);
    expect((await listPrograms(admin.principal, 'crossfit')).find((x) => x.id === id)).toMatchObject({ total: 3, generated: 0 });

    const day = await generateProgramDay(admin.principal, id, '2026-11-11');
    expect(day.check.totalMin).toBe(55);
    await expect(generateProgramDay(admin.principal, id, '2026-11-10')).rejects.toThrow(/não está na planilha/);
    expect(Object.keys((await getProgram(admin.principal, id)).days)).toEqual(['2026-11-11']);

    await expect(insertProgramDays(admin.principal, id, ['2026-11-09'], false, META)).rejects.toThrow(/Gere as aulas/);
    const ins = await insertProgramDays(admin.principal, id, ['2026-11-09', '2026-11-11'], false, META);
    expect(ins.inserted).toBe(1);
    const wd = await prisma.workoutDay.findFirstOrThrow({ where: { weekId: ins.weekIds[0]!, blocks: { some: {} } }, include: { blocks: true } });
    expect(wd.blocks.map((b) => b.kind)).toContain('WOD');
    // Dia já lançado: só substitui com confirmação.
    await expect(insertProgramDays(admin.principal, id, ['2026-11-11'], false, META)).rejects.toThrow(/Confirme para substituir/);
    expect((await insertProgramDays(admin.principal, id, ['2026-11-11'], true, META)).inserted).toBe(1);
  });
});
