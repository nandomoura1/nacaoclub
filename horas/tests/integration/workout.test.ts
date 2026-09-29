import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { createWeek, getWeek, listWeeks, saveWeek } from '@/server/services/workout-service';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';
import { crossfitWeek } from '../fixtures/workout-crossfit';

describe.skipIf(!hasDb)('Treinos da semana', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let crossfit: { id: string; areaId: string };
  let futevolei: { id: string; areaId: string };

  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
    crossfit = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    futevolei = await prisma.modality.findUniqueOrThrow({ where: { name: 'Futevôlei' } });
  });

  it('cria a semana na segunda-feira, salva e reabre igual', async () => {
    const id = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2040-10-03' }, META); // sábado → semana de 01/10/2040
    const fresh = await getWeek(admin.principal, id);
    expect(fresh.weekStart).toBe('2040-10-01');
    expect(fresh.days.map((d) => d.date)).toEqual(['2040-10-01', '2040-10-02', '2040-10-03', '2040-10-04', '2040-10-05', '2040-10-06']);
    // Mesma modalidade e semana: abre a existente.
    expect(await createWeek(admin.principal, { modalityId: crossfit.id, date: '2040-10-05' }, META)).toBe(id);

    const shift = (d: string) => d.replace('2026-09-28', '2040-10-01').replace('2026-09-29', '2040-10-02').replace('2026-09-30', '2040-10-03').replace('2026-10-01', '2040-10-04').replace('2026-10-02', '2040-10-05').replace('2026-10-03', '2040-10-06');
    const days = crossfitWeek.days.map((d) => ({ ...d, date: shift(d.date) }));
    await saveWeek(admin.principal, id, { footerTitle: 'ClubFit', footerText: 'Novidade', footerChips: 'Aulão|7H', days }, META);
    const saved = await getWeek(admin.principal, id);
    expect(saved.days).toHaveLength(6);
    expect(saved.days[0]!.blocks.map((b) => b.kind)).toEqual(['AQUECIMENTO', 'FORCA', 'ESPECIFICO', 'WOD']);
    expect(saved.days[0]!.blocks[3]).toMatchObject({ title: "O'Connor", format: '3 rounds for time', durationMin: 15 });
    expect(saved.footerChips).toBe('Aulão|7H');

    await expect(saveWeek(admin.principal, id, { days: [{ date: '2040-10-08', blocks: [] }] }, META)).rejects.toThrow(/não é desta semana/);
    await expect(saveWeek(admin.principal, id, { days: [{ date: '2040-10-01', blocks: [{ kind: 'WOD', durationMin: 900 }] }] }, META)).rejects.toThrow(AppError);

    // Semana seguinte copiando a anterior: mesmos blocos, datas +7.
    const next = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2040-10-08', copyPrevious: true }, META);
    const copy = await getWeek(admin.principal, next);
    expect(copy.days[0]!.date).toBe('2040-10-08');
    expect(copy.days[0]!.blocks[3]!.title).toBe("O'Connor");
    expect(copy.footerTitle).toBe('ClubFit');
  });

  it('coordenador só vê e lança treinos das modalidades da área dele; professor não entra', async () => {
    const cf = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2040-11-05' }, META);
    const coordFut = await makeUser('COORDENADOR', { areaIds: [futevolei.areaId] });
    await expect(getWeek(coordFut.principal, cf)).rejects.toThrow(AuthorizationError);
    await expect(createWeek(coordFut.principal, { modalityId: crossfit.id, date: '2040-11-05' }, META)).rejects.toThrow(AuthorizationError);
    const fut = await createWeek(coordFut.principal, { modalityId: futevolei.id, date: '2040-11-05' }, META);
    expect((await listWeeks(coordFut.principal)).map((w) => w.id)).toContain(fut);
    expect((await listWeeks(coordFut.principal)).map((w) => w.id)).not.toContain(cf);
    const prof = await makeUser('PROFESSOR');
    await expect(listWeeks(prof.principal)).rejects.toThrow(AuthorizationError);
  });

  it('o banco só aceita semana começando na segunda', async () => {
    await expect(prisma.workoutWeek.create({ data: { modalityId: crossfit.id, weekStart: new Date('2040-12-04') } })).rejects.toThrow();
  });
});
