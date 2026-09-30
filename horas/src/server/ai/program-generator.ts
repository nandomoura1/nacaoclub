import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, toUtc, weekdayOf, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { mondayOf } from '@/domain/workout';
import { dayToSession, planToBlocks, sessionText, type AiPlan, type PlanCheck } from '@/domain/programming/ai-plan';
import {
  CAPACITY_LABEL, HORIZON_LABEL, LEVEL_LABEL, ProgramPlanSchema, dayInPlan, horizon, normalizePlan, programRequestSchema, trainingDates,
  type ProgramPlan, type ProgramRequest,
} from '@/domain/programming/ai-program';
import { modalitySlug, programModality } from '@/domain/programming/modalities';
import type { Session } from '@/domain/programming/history';
import { askModel, generateWorkout, isFake, programmedDays, systemPrompt } from './workout-generator';
import { setDayFromAi, workoutModalities } from '@/server/services/workout-service';

/**
 * Planilhas da IA: a estratégia (periodização nova ou continuidade) é gerada
 * de uma vez; as aulas, dia a dia, com a estratégia e os dias anteriores da
 * planilha no contexto. Nada vira treino oficial até o coach lançar.
 */

export interface ProgramDayResult { plan: AiPlan; check: PlanCheck; generatedAt: string }
type DaysMap = Record<string, ProgramDayResult>;

const PERIODIZATION_RULES = `# Como montar a periodização (regras do sistema da Nação)
- Escolha o modelo pelo objetivo e pelo prazo: força em até 4 semanas = linear curto (3 semanas subindo + teste); 6–8 semanas = acumulação → intensificação → teste, com 2 estímulos/semana (dia pesado + dia leve); 10–12 semanas = step loading 3:1 (3 semanas subindo, 1 de deload). LPO: técnica → força → potência. Ginástica/skill: drills → volume submáximo → densidade → teste. Engine: base aeróbia → limiar → intervalos curtos. Benchmark: preparação → desenvolvimento → teste, subindo 10–15% por semana o volume dos componentes.
- Reps por zona (Prilepin): 70–80% → 12–24 reps totais; 80–90% → 10–20; acima de 90% → 4–10. Deload: volume −40%.
- Teste: 3RM para turmas gerais; 1RM só avançado/competição. A semana de teste tem WODs leves e sem o padrão testado.
- O ciclo específico ocupa no máximo 1–2 estímulos por semana. O resto da semana segue o DNA da Nação (CrossFit geral, variado): nunca transforme todas as aulas no objetivo.
- Sem força pesada do mesmo padrão com menos de 48 h. Varie time domains e modalidades ao longo da semana; equilibre as lacunas do DNA.`;

function describeProgram(req: ProgramRequest, dates: IsoDate[], recent: Session[]): string {
  const h = horizon(req);
  const byWeek = new Map<IsoDate, IsoDate[]>();
  for (const d of dates) byWeek.set(mondayOf(d), [...(byWeek.get(mondayOf(d)) ?? []), d]);
  const weeks = [...byWeek.entries()].map(([mon, ds], i) => `Semana ${i + 1} (${formatDateBR(mon)}): ${ds.map((d) => `${WEEKDAYS[weekdayOf(d) - 1]!.long} ${d}`).join(', ')}`).join('\n');
  const what = req.kind === 'periodizacao'
    ? `Crie uma PERIODIZAÇÃO NOVA.
- Objetivo do coach: ${req.goal || '(não descrito)'}
- Capacidade: ${CAPACITY_LABEL[req.capacity]}${req.movement ? ` · movimento: ${req.movement}` : ''}
- Teste ao final: ${req.test}
- Perfil: ${LEVEL_LABEL[req.level]}`
    : `Crie uma CONTINUIDADE da programação: siga a partir dos últimos ${req.window} dias, mantendo o DNA da Nação e equilibrando o que ficou para trás (padrões, time domains, lacunas). ${req.goal ? `Observação do coach: ${req.goal}` : ''}`;
  return `${what}
- Prazo: ${req.length} ${req.unit} (${HORIZON_LABEL[h].toLowerCase()}), de ${formatDateBR(dates[0]!)} a ${formatDateBR(dates.at(-1)!)}.
- ${dates.length} aulas, só nestas datas (use exatamente estas, uma entrada por data):
${weeks}

${req.kind === 'periodizacao' ? PERIODIZATION_RULES : '# Continuidade\n- Sem objetivo único: varie estímulos e cubra as lacunas, sem repetir o padrão dominante nem o time domain em dias seguidos.'}

Para cada dia, descreva o tema, o bloco de força/skill (com esquema e %, ou vazio) e o estímulo do WOD (time domain, formato, modalidades). A aula completa será escrita depois, dia a dia, a partir deste plano.

Programação dos últimos ${req.window} dias (para continuar a partir dela):
${recent.length ? recent.map(sessionText).join('\n') : '(nenhum dia registrado no período)'}`;
}

function fakeProgram(dates: IsoDate[]): ProgramPlan {
  const byWeek = new Map<IsoDate, IsoDate[]>();
  for (const d of dates) byWeek.set(mondayOf(d), [...(byWeek.get(mondayOf(d)) ?? []), d]);
  return {
    titulo: 'Planilha de exemplo', modelo: 'Continuidade', estrategia: 'Exemplo local (AI_FAKE): sem chamada ao modelo.', objetivoFinal: 'Manter o DNA.',
    fases: [{ nome: 'Base', semanas: `1–${byWeek.size}`, objetivo: 'Variedade com equilíbrio de padrões.' }],
    semanas: [...byWeek.values()].map((ds, i) => ({
      semana: i + 1, fase: 'Base', foco: 'Variedade', volume: 'moderado' as const, intensidade: 'moderada' as const, deload: false,
      dias: ds.map((d, j) => ({ data: d, tema: j % 2 ? 'WOD longo' : 'Força + WOD curto', forca: j % 2 ? '' : "Front squat a cada 2' 5x3 @75-80%", wod: j % 2 ? 'Longo 21–30 min, mono + ginástica' : 'Curto até 10 min', intensidade: 'MODERATE' as const })),
    })),
    testes: [], decisoes: ['Exemplo local.'],
  };
}

async function modalityIdFor(principal: Principal, slug: string): Promise<string> {
  const m = (await workoutModalities(principal)).find((x) => modalitySlug(x.name) === slug);
  if (!m) throw new AppError('Você não tem acesso a esta modalidade no Cadastro de Treino.');
  return m.id;
}

function toView(p: Awaited<ReturnType<typeof prisma.trainingProgram.findUniqueOrThrow>>) {
  return {
    id: p.id, modality: p.modality, title: p.title, kind: p.kind as ProgramRequest['kind'],
    startDate: fromUtc(p.startDate), endDate: fromUtc(p.endDate), createdAt: p.createdAt.toISOString(),
    request: p.request as unknown as ProgramRequest, plan: p.plan as unknown as ProgramPlan, days: p.days as unknown as DaysMap,
  };
}
export type ProgramView = ReturnType<typeof toView>;

export async function createProgram(principal: Principal | null, slug: string, input: unknown, meta: RequestMeta): Promise<string> {
  assertCan(principal, 'workout.edit');
  const parsed = programRequestSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Pedido inválido.');
  const req = parsed.data;
  programModality(slug);
  await modalityIdFor(principal, slug);
  if (req.kind === 'periodizacao' && !req.goal && req.capacity === 'geral') throw new AppError('Descreva o objetivo da periodização ou escolha a capacidade.');
  const dates = trainingDates(req);
  if (!dates.length) throw new AppError('Nenhum dia de aula no período escolhido.');
  const recent = await programmedDays(slug, addDays(req.startDate, -req.window), addDays(req.startDate, -1));
  const plan = normalizePlan(
    isFake() ? fakeProgram(dates) : await askModel(ProgramPlanSchema, systemPrompt(slug), describeProgram(req, dates, recent), 32000),
    dates,
  );
  const title = (req.title || plan.titulo).slice(0, 80);
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.trainingProgram.create({
      data: {
        modality: slug, title, kind: req.kind, startDate: toUtc(dates[0]!), endDate: toUtc(dates.at(-1)!),
        request: req as object, plan: plan as object, createdById: principal.id,
      },
    });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'program.created', entityType: 'training_program', entityId: p.id,
      after: { titulo: title, aulas: dates.length }, summary: `${principal.name} gerou a planilha "${title}" (${dates.length} aulas) com a IA`,
    });
    return p;
  });
  return created.id;
}

export async function listPrograms(principal: Principal | null, slug: string) {
  assertCan(principal, 'workout.edit');
  const rows = await prisma.trainingProgram.findMany({ where: { modality: slug }, orderBy: { createdAt: 'desc' }, take: 30 });
  return rows.map((r) => {
    const v = toView(r);
    const total = v.plan.semanas.reduce((s, w) => s + w.dias.length, 0);
    return { id: v.id, title: v.title, kind: v.kind, startDate: v.startDate, endDate: v.endDate, total, generated: Object.keys(v.days).length };
  });
}

export async function getProgram(principal: Principal | null, id: string): Promise<ProgramView> {
  assertCan(principal, 'workout.edit');
  const p = await prisma.trainingProgram.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Planilha não encontrada.');
  return toView(p);
}

/** Aula completa de um dia da planilha (IA), com a estratégia e os dias anteriores dela no contexto. */
export async function generateProgramDay(principal: Principal | null, id: string, date: IsoDate): Promise<ProgramDayResult> {
  const program = await getProgram(principal, id);
  const at = dayInPlan(program.plan, date);
  if (!at) throw new AppError('Esta data não está na planilha.');
  const earlier: Session[] = Object.entries(program.days)
    .filter(([d]) => d < date)
    .map(([d, r]) => dayToSession({ date: d, title: r.plan.titulo, blocks: planToBlocks(r.plan) }));
  const p = program.plan;
  const context = `# Esta aula faz parte da planilha "${program.title}" (${p.modelo})
Estratégia: ${p.estrategia}
Objetivo final: ${p.objetivoFinal}
Semana ${at.week.semana} — fase ${at.week.fase}; foco: ${at.week.foco}; volume ${at.week.volume}; intensidade ${at.week.intensidade}${at.week.deload ? '; SEMANA DE DELOAD' : ''}.
Plano deste dia (siga-o): tema "${at.day.tema}"; força/skill: ${at.day.forca || 'sem bloco de força'}; WOD: ${at.day.wod}; intensidade ${at.day.intensidade}.
Resto da semana na planilha: ${at.week.dias.filter((d) => d.data !== date).map((d) => `${d.data}: ${d.tema}`).join(' | ')}`;
  const r = await generateWorkout(principal, program.modality, {
    date, focus: at.day.tema, strength: at.day.forca.trim() ? 'sim' : 'nao', wodMinutes: 'auto',
    partner: /dupla|partner|trio/i.test(`${at.day.tema} ${at.day.wod}`), window: program.request.window ?? 14,
  }, { extraContext: context, extraDays: earlier });
  const result: ProgramDayResult = { plan: r.plan, check: r.check, generatedAt: new Date().toISOString() };
  await prisma.$transaction(async (tx) => {
    const cur = await tx.trainingProgram.findUniqueOrThrow({ where: { id }, select: { days: true } });
    await tx.trainingProgram.update({ where: { id }, data: { days: { ...(cur.days as object), [date]: result } as object } });
  });
  return result;
}

/** Lança no Cadastro de Treino os dias já gerados (ex.: uma semana). */
export async function insertProgramDays(principal: Principal | null, id: string, dates: IsoDate[], replace: boolean, meta: RequestMeta): Promise<{ inserted: number; weekIds: string[] }> {
  const program = await getProgram(principal, id);
  const ready = dates.filter((d) => program.days[d]);
  if (!ready.length) throw new AppError('Gere as aulas antes de lançar.');
  const modalityId = await modalityIdFor(principal!, program.modality);
  if (!replace) {
    const busy = await prisma.workoutDay.findMany({
      where: { date: { in: ready.map(toUtc) }, week: { modalityId }, blocks: { some: {} } }, select: { date: true },
    });
    if (busy.length) throw new AppError(`Já têm treino lançado: ${busy.map((b) => formatDateBR(fromUtc(b.date))).join(', ')}. Confirme para substituir.`);
  }
  const weekIds = new Set<string>();
  for (const d of ready) {
    const r = program.days[d]!;
    const { weekId } = await setDayFromAi(principal, { modalityId, date: d, title: r.plan.titulo, blocks: planToBlocks(r.plan), replace: true }, meta);
    weekIds.add(weekId);
  }
  return { inserted: ready.length, weekIds: [...weekIds] };
}

export async function deleteProgram(principal: Principal | null, id: string, meta: RequestMeta) {
  assertCan(principal, 'workout.edit');
  await prisma.$transaction(async (tx) => {
    const p = await tx.trainingProgram.findUnique({ where: { id } });
    if (!p) throw new NotFoundError('Planilha não encontrada.');
    await tx.trainingProgram.delete({ where: { id } });
    await audit(tx, { actorId: principal.id, ...meta }, {
      action: 'program.deleted', entityType: 'training_program', entityId: id, summary: `${principal.name} excluiu a planilha "${p.title}"`,
    });
  });
}
