import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { setDayFromAi } from '@/server/services/workout-service';
import { getDnaReport } from '@/server/programming/dna-report';
import { systemPrompt } from '@/server/ai/workout-generator';
import { META, hasDb, makeUser } from './helpers';

/** Datas de 2037 (fora do histórico importado), próprias deste arquivo. */
describe.skipIf(!hasDb)('DNA por período, aprendendo com o Cadastro de Treino', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
  });
  const b = (kind: string, durationMin: number, title: string | null, format: string | null, content: string | null) =>
    ({ kind, durationMin, title, format, timeCapMin: null, content, notes: null, coachNotes: null }) as never;

  it('CrossFit: aula lançada entra no DNA do período, na base completa e nos exemplos da IA', async () => {
    const cf = await prisma.modality.findUniqueOrThrow({ where: { name: 'CrossFit' } });
    await setDayFromAi(admin.principal, {
      modalityId: cf.id, date: '2037-03-04', title: 'Teste período', replace: true,
      blocks: [b('AQUECIMENTO', 12, null, null, '400m run'), b('WOD', 15, 'Fila 2037', 'AMRAP 15', '10 thruster 29/43kg\n15 pull-up\n200m run')],
    }, META);
    const r = await getDnaReport('crossfit', { from: '2037-03-01', to: '2037-03-31' });
    expect(r).toMatchObject({ empty: false, counts: { history: 0, launched: 1 } });
    if (r.empty || r.technical) throw new Error('esperado DNA de WOD');
    expect(r.dna.period.sessions).toBe(1);
    expect(r.dna.movements.map((m) => m.id)).toEqual(expect.arrayContaining(['thruster', 'pull-up']));

    const all = await getDnaReport('crossfit');
    expect(all.counts.history).toBeGreaterThan(300); // o histórico continua
    expect(all.counts.launched).toBeGreaterThanOrEqual(1);
    expect(await systemPrompt('crossfit')).toContain('Fila 2037'); // a IA vê a aula lançada como exemplo recente

    expect(await getDnaReport('crossfit', { from: '2037-06-01', to: '2037-06-30' })).toMatchObject({ empty: true, counts: { history: 0, launched: 0 } });
  });

  it('Futevôlei: no período, só as aulas lançadas (os planos da metodologia não têm data)', async () => {
    const fv = await prisma.modality.findUniqueOrThrow({ where: { name: 'Futevôlei' } });
    await setDayFromAi(admin.principal, {
      modalityId: fv.id, date: '2037-03-05', title: 'Recepção de saque', replace: true,
      blocks: [b('AQUECIMENTO', 12, 'Enquadramento', null, 'Duplas'), b('FUNDAMENTO', 23, 'Recepção', null, 'Bola previsível\nVariação de direção\nRecepção + construção'), b('JOGO', 20, 'Primeira bola vale dobro', 'Jogo condicionado', 'Ponto: 1')],
    }, META);
    const r = await getDnaReport('futevolei', { from: '2037-03-01', to: '2037-03-31' });
    expect(r).toMatchObject({ empty: false, technical: true, counts: { history: 0, launched: 1 } });
    if (r.empty || !r.technical) throw new Error('esperado DNA técnico');
    expect(r.dna.fundamentals.map((f) => f.id)).toContain('recepcao');
    expect(r.dna.progression.avgSteps).toBe(3);
    const all = await getDnaReport('futevolei');
    expect(all.counts).toMatchObject({ history: 24 });
  });
});
