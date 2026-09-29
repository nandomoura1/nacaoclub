import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { CROSSFIT_BENCHMARKS } from '@/domain/benchmarks';
import { listBenchmarks, saveBenchmark, setBenchmarkActive } from '@/server/services/benchmark-service';
import { AuthorizationError } from '@/server/errors';
import { bootstrapStructure } from '@/server/services/bootstrap';
import { META, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Benchmarks', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await prisma.$transaction((tx) => bootstrapStructure(tx, []), { timeout: 60_000 });
    admin = await makeUser('ADMIN', { name: 'Admin' });
  });

  it('a biblioteca oficial entra sozinha, uma vez só', async () => {
    const a = await listBenchmarks(admin.principal);
    await listBenchmarks(admin.principal);
    expect(await prisma.workoutBenchmark.count({ where: { source: 'CROSSFIT' } })).toBe(CROSSFIT_BENCHMARKS.length);
    expect(a.find((b) => b.name === 'Fran')).toMatchObject({ category: 'GIRL', source: 'CROSSFIT' });
  });

  it('cadastra e edita benchmark da Nação; oficial não edita; nome repetido não passa', async () => {
    const n = `Nação 300 ${Date.now()}`;
    const id = await saveBenchmark(admin.principal, null, { name: n, format: 'For time', timeCapMin: '25', content: '100 wall balls\n100 box jumps\n100 burpees' }, META);
    const saved = (await listBenchmarks(admin.principal)).find((b) => b.id === id)!;
    expect(saved).toMatchObject({ category: 'NACAO', source: 'NACAO', timeCapMin: 25 });
    await saveBenchmark(admin.principal, id, { name: n, content: '150 wall balls', notes: 'Versão curta' }, META);
    expect((await listBenchmarks(admin.principal)).find((b) => b.id === id)).toMatchObject({ content: '150 wall balls', notes: 'Versão curta', format: null });

    const fran = (await listBenchmarks(admin.principal)).find((b) => b.name === 'Fran')!;
    await expect(saveBenchmark(admin.principal, fran.id, { name: 'Fran', content: 'x x x' }, META)).rejects.toThrow(/oficiais/);
    await expect(saveBenchmark(admin.principal, null, { name: 'fran', content: 'x x x' }, META)).rejects.toThrow(/Já existe/);
    await expect(saveBenchmark(admin.principal, null, { name: 'Sem movimentos', content: '' }, META)).rejects.toThrow(/movimentos/);
  });

  it('ocultar tira da lista do editor e reativar devolve', async () => {
    const grace = (await listBenchmarks(admin.principal)).find((b) => b.name === 'Grace')!;
    await setBenchmarkActive(admin.principal, grace.id, false, META);
    expect((await listBenchmarks(admin.principal)).some((b) => b.id === grace.id)).toBe(false);
    expect((await listBenchmarks(admin.principal, { includeInactive: true })).some((b) => b.id === grace.id)).toBe(true);
    await setBenchmarkActive(admin.principal, grace.id, true, META);
    expect((await listBenchmarks(admin.principal)).some((b) => b.id === grace.id)).toBe(true);
  });

  it('professor não acessa', async () => {
    const prof = await makeUser('PROFESSOR');
    await expect(listBenchmarks(prof.principal)).rejects.toThrow(AuthorizationError);
  });
});
