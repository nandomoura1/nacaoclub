import { z } from 'zod';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { CROSSFIT_BENCHMARKS, type BenchmarkCategory } from '@/domain/benchmarks';
import { PROGRAM_MODALITIES } from '@/domain/programming/modalities';

/**
 * Biblioteca de benchmarks do módulo de Treinos, uma por modalidade. Os
 * oficiais do CrossFit entram sozinhos (e só podem ser ativados/desativados);
 * os da Nação são cadastrados pela equipe em cada modalidade.
 */
const BENCHMARK_SLUGS = PROGRAM_MODALITIES.filter((m) => m.benchmarks).map((m) => m.slug) as [string, ...string[]];

const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const saveSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao benchmark.').max(60),
  format: optText(120),
  timeCapMin: z.union([z.coerce.number().int().min(1).max(300), z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  content: z.string().trim().min(2, 'Liste os movimentos (um por linha).').max(2000),
  notes: optText(500),
  modality: z.enum(BENCHMARK_SLUGS).default('crossfit'),
});

/** Garante que a biblioteca oficial está no banco (idempotente; nomes existentes não mudam). */
export async function ensureCrossfitLibrary() {
  const have = await prisma.workoutBenchmark.count({ where: { source: 'CROSSFIT' } });
  if (have >= CROSSFIT_BENCHMARKS.length) return;
  await prisma.workoutBenchmark.createMany({
    data: CROSSFIT_BENCHMARKS.map((x) => ({ ...x, source: 'CROSSFIT', modality: 'crossfit' })),
    skipDuplicates: true,
  });
}

export async function listBenchmarks(principal: Principal | null, opts: { includeInactive?: boolean; modality?: string } = {}) {
  assertCan(principal, 'workout.edit');
  const modality = opts.modality ?? 'crossfit';
  if (modality === 'crossfit') await ensureCrossfitLibrary();
  const rows = await prisma.workoutBenchmark.findMany({
    where: { modality, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, category: r.category as BenchmarkCategory, format: r.format, timeCapMin: r.timeCapMin,
    content: r.content, notes: r.notes, source: r.source, active: r.active,
  }));
}
export type BenchmarkView = Awaited<ReturnType<typeof listBenchmarks>>[number];

/** Cria (id null) ou edita um benchmark da Nação. */
export async function saveBenchmark(principal: Principal | null, id: string | null, input: unknown, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const clash = await tx.workoutBenchmark.findFirst({ where: { modality: data.modality, name: { equals: data.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new AppError(`Já existe um benchmark chamado "${clash.name}".`);
    if (id) {
      const before = await tx.workoutBenchmark.findUnique({ where: { id } });
      if (!before) throw new NotFoundError('Benchmark não encontrado.');
      if (before.source === 'CROSSFIT') throw new AppError('Os benchmarks oficiais do CrossFit não podem ser editados. Crie uma versão da Nação.');
      if (before.modality !== data.modality) throw new AppError('O benchmark pertence a outra modalidade.');
      await tx.workoutBenchmark.update({ where: { id }, data });
      await audit(tx, { actorId: principal.id, ...meta }, {
        action: 'benchmark.updated', entityType: 'workout_benchmark', entityId: id,
        before: { nome: before.name }, after: { nome: data.name },
        summary: `${principal.name} editou o benchmark ${data.name}`,
      });
      return id;
    }
    const created = await tx.workoutBenchmark.create({ data: { ...data, category: 'NACAO', source: 'NACAO', createdById: principal.id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'benchmark.created', entityType: 'workout_benchmark', entityId: created.id,
      after: { nome: data.name }, summary: `${principal.name} cadastrou o benchmark ${data.name}`,
    });
    return created.id;
  });
}

export async function setBenchmarkActive(principal: Principal | null, id: string, active: boolean, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  return prisma.$transaction(async (tx) => {
    const bm = await tx.workoutBenchmark.findUnique({ where: { id } });
    if (!bm) throw new NotFoundError('Benchmark não encontrado.');
    await tx.workoutBenchmark.update({ where: { id }, data: { active } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: active ? 'benchmark.activated' : 'benchmark.deactivated', entityType: 'workout_benchmark', entityId: id,
      summary: `${principal.name} ${active ? 'reativou' : 'ocultou'} o benchmark ${bm.name}`,
    });
  });
}
