import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { changeWeekModality, createWeek, getWeek, listWeeks, saveWeek } from '@/server/services/workout-service';
import { AppError, AuthorizationError } from '@/server/errors';
import { META, hasDb, makeUser } from './helpers';
import { crossfitWeek } from '../fixtures/workout-crossfit';
import { futevoleiSemanaTexto } from '../fixtures/futevolei-semana-texto';
import { organizeWeekText } from '@/server/ai/week-organizer';
import { whatsappText } from '@/domain/workout';

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
    // Orientações ao professor ficam guardadas por bloco.
    const coached = saved.days.map((d, i) => (i ? d : { ...d, blocks: d.blocks.map((b, j) => (j === 1 ? { ...b, coachNotes: 'Suba a carga aos poucos.' } : b)) }));
    await saveWeek(admin.principal, id, { footerTitle: 'ClubFit', footerText: 'Novidade', footerChips: 'Aulão|7H', days: coached }, META);
    expect((await getWeek(admin.principal, id)).days[0]!.blocks[1]!.coachNotes).toBe('Suba a carga aos poucos.');

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
    const prof = await makeUser('PROFESSOR'); // professor vê os treinos de todas as modalidades, mas não lança
    expect((await listWeeks(prof.principal)).map((w) => w.id)).toEqual(expect.arrayContaining([cf, fut]));
    await expect(createWeek(prof.principal, { modalityId: futevolei.id, date: '2040-11-12' }, META)).rejects.toThrow(AuthorizationError);
  });

  it('troca a modalidade depois de criado: move, junta ao plano existente e bloqueia dia em conflito', async () => {
    const wod = [{ kind: 'WOD', title: 'Teste', durationMin: 12 }];
    const a = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2041-03-04' }, META); // semana de 04/03/2041
    await saveWeek(admin.principal, a, { days: [{ date: '2041-03-04', blocks: wod }, { date: '2041-03-05', blocks: [] }] }, META);
    // Sem plano no destino: o mesmo plano muda de modalidade.
    expect(await changeWeekModality(admin.principal, a, futevolei.id, META)).toBe(a);
    expect((await getWeek(admin.principal, a)).modality).toBe('Futevôlei');

    // Destino já tem plano: os dias com treino vão para ele e o de origem some.
    const b = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2041-03-04' }, META);
    await saveWeek(admin.principal, b, { days: [{ date: '2041-03-06', blocks: wod }, { date: '2041-03-04', blocks: [] }] }, META);
    expect(await changeWeekModality(admin.principal, b, futevolei.id, META)).toBe(a);
    expect(await prisma.workoutWeek.findUnique({ where: { id: b } })).toBeNull();
    const merged = await getWeek(admin.principal, a);
    expect(merged.days.filter((d) => d.blocks.length).map((d) => d.date)).toEqual(['2041-03-04', '2041-03-06']);

    // Mesmo dia com treino nos dois lados: não troca.
    const c = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2041-03-04' }, META);
    await saveWeek(admin.principal, c, { days: [{ date: '2041-03-04', blocks: wod }] }, META);
    await expect(changeWeekModality(admin.principal, c, futevolei.id, META)).rejects.toThrow(/já tem treino em 04\/03\/2041/);
    expect((await getWeek(admin.principal, c)).modality).toBe('CrossFit');

    // Coordenador de outra área não move para lá.
    const coordFut = await makeUser('COORDENADOR', { areaIds: [futevolei.areaId] });
    await expect(changeWeekModality(coordFut.principal, a, crossfit.id, META)).rejects.toThrow(AuthorizationError);
  });

  it('monta a semana pelo texto: dias escritos sem IA, só a ideia com IA; a intenção fica salva', async () => {
    const id = await createWeek(admin.principal, { modalityId: futevolei.id, date: '2041-06-03' }, META); // semana de 03/06/2041
    // Texto com os dias: organiza do jeito que está (datas de out/2026 viram os dias desta semana, com aviso).
    const t = await organizeWeekText(admin.principal, id, { text: futevoleiSemanaTexto, weekdays: [] });
    expect(t.mode).toBe('texto');
    expect(t.theme).toBe('LEVANTADA');
    expect(t.days.map((d) => d.date)).toEqual(['2041-06-03', '2041-06-04', '2041-06-05', '2041-06-06']);
    expect(t.warnings).toHaveLength(4);
    // O coach salva o que foi organizado: o editor manda tema + dias.
    await saveWeek(admin.principal, id, { theme: t.theme, days: t.days }, META);
    const saved = await getWeek(admin.principal, id);
    expect(saved.theme).toBe('LEVANTADA');
    expect(saved.days[0]!.blocks.map((b) => b.kind)).toEqual(['MOBILIDADE', 'AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
    expect(whatsappText(saved)).toContain('🎯 *Intenção: LEVANTADA*');

    // Só a ideia central: a IA monta os dias marcados (exemplo local, sem chamar o modelo).
    const prev = process.env.AI_FAKE;
    process.env.AI_FAKE = '1';
    try {
      const ia = await organizeWeekText(admin.principal, id, { text: 'Intenção do mês: levantada — chapa, ombro, coxa e cabeça', weekdays: [1, 2, 4] });
      expect(ia.mode).toBe('ia');
      expect(ia.days.map((d) => d.date)).toEqual(['2041-06-03', '2041-06-04', '2041-06-06']);
      expect(ia.days[0]!.blocks.map((b) => b.kind)).toEqual(['AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
      await expect(organizeWeekText(admin.principal, id, { text: 'levantada', weekdays: [] })).rejects.toThrow(/Escolha os dias/);
    } finally {
      if (prev === undefined) delete process.env.AI_FAKE; else process.env.AI_FAKE = prev;
    }

    // Modalidade sem IA: só com os dias escritos.
    const musc = await prisma.modality.findFirstOrThrow({ where: { name: 'Musculação' } });
    const mw = await createWeek(admin.principal, { modalityId: musc.id, date: '2041-06-03' }, META);
    await expect(organizeWeekText(admin.principal, mw, { text: 'foco em posterior', weekdays: [1] })).rejects.toThrow(/escreva os dias/);
    // Coordenador de outra área não organiza.
    const coordFut = await makeUser('COORDENADOR', { areaIds: [futevolei.areaId] });
    const cf = await createWeek(admin.principal, { modalityId: crossfit.id, date: '2041-06-03' }, META);
    await expect(organizeWeekText(coordFut.principal, cf, { text: futevoleiSemanaTexto, weekdays: [] })).rejects.toThrow(AuthorizationError);
  });

  it('o banco só aceita semana começando na segunda', async () => {
    await expect(prisma.workoutWeek.create({ data: { modalityId: crossfit.id, weekStart: new Date('2040-12-04') } })).rejects.toThrow();
  });
});
