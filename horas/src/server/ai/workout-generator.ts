import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AppError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { lessonMinutes, mondayOf, type BlockKind } from '@/domain/workout';
import { parseHistory, type Session } from '@/domain/programming/history';
import { CROSSFIT_HISTORY } from '@/domain/programming/history.generated';
import { AiPlanSchema, checkPlan, dayToSession, sessionText, type AiPlan, type PlanCheck } from '@/domain/programming/ai-plan';
import { modalitySlug, programModality } from '@/domain/programming/modalities';
import { addBlock, WEEK_METRICS, type WeekMetric } from '@/domain/programming/volume';
import { blockVolume } from '@/domain/programming/calculator';
import { LEVEL_RATIO } from '@/domain/programming/taxonomy';
import { getDnaReport } from '@/server/programming/dna-report';

/**
 * Geração de treino por IA (copiloto do coach). O modelo recebe o DNA da
 * modalidade, as lacunas, os últimos dias programados e o pedido do coach;
 * devolve um plano de aula estruturado, que o motor confere antes de o coach
 * decidir se leva para o Cadastro de Treino.
 */

export const MODEL = 'claude-opus-5-5';
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY || process.env.AI_FAKE === '1';

export const requestSchema = z.object({
  date: z.string().refine(isIsoDate, 'Data inválida.'),
  focus: z.string().trim().max(400).optional().default(''),
  strength: z.enum(['auto', 'sim', 'nao']).default('auto'),
  wodMinutes: z.enum(['auto', 'curto', 'medio', 'longo']).default('auto'),
  partner: z.boolean().default(false),
  avoid: z.string().trim().max(300).optional().default(''),
});
export type GenerateRequest = z.input<typeof requestSchema>;

const HISTORY: Record<string, string> = { crossfit: CROSSFIT_HISTORY };

/** Dias programados da modalidade entre duas datas: banco (Cadastro de Treino) por cima do histórico. */
async function programmedDays(slug: string, from: IsoDate, to: IsoDate): Promise<Session[]> {
  const byDate = new Map<string, Session>();
  for (const s of parseHistory(HISTORY[slug] ?? '')) if (s.date >= from && s.date <= to && !s.special) byDate.set(s.date, s);
  const modalities = (await prisma.modality.findMany({ select: { id: true, name: true } })).filter((m) => modalitySlug(m.name) === slug);
  if (modalities.length) {
    const days = await prisma.workoutDay.findMany({
      where: { date: { gte: toUtc(from), lte: toUtc(to) }, week: { modalityId: { in: modalities.map((m) => m.id) } } },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    for (const d of days) {
      if (!d.blocks.length) continue;
      byDate.set(fromUtc(d.date), dayToSession({
        date: fromUtc(d.date), title: d.title,
        blocks: d.blocks.map((b) => ({ kind: b.kind as BlockKind, title: b.title, durationMin: b.durationMin, format: b.format, timeCapMin: b.timeCapMin, content: b.content, notes: b.notes, coachNotes: b.coachNotes })),
      }));
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Parte estável do prompt (cacheável): quem é o copiloto e o DNA da modalidade. */
export function systemPrompt(slug: string): string {
  const r = getDnaReport(slug);
  if (r.empty || r.technical) throw new AppError('Esta modalidade ainda não tem geração de treino.');
  const d = r.dna;
  const lesson = lessonMinutes(r.modality.name) ?? 55;
  const pct = (n: number) => `${String(n).replace('.', ',')}%`;
  const topMoves = (mod: string) => d.movements.filter((m) => m.modality === mod).slice(0, 10).map((m) => `${m.name} ${String(m.perWeek).replace('.', ',')}/sem`).join('; ');
  const examples = parseHistory(HISTORY[slug] ?? '').filter((s) => !s.special).slice(-12).map(sessionText).join('\n');
  return `Você é o copiloto de programação do Head Coach do ${r.modality.name} da Nação Club (Brasília). Você propõe o plano de aula de um dia; o coach revisa e decide. Escreva em português do Brasil, com os nomes de movimentos em inglês como a Nação usa ("thruster", "pull-up", "wall ball").

# Como a Nação programa (DNA medido em ${d.period.sessions} aulas, ${d.period.weeks} semanas)
Aula de ${lesson} minutos. Estrutura típica: mobilidade ~5', warm-up ~${d.structure.avgBlockMin.WU ?? 12}', específico/técnica ~${d.structure.avgBlockMin.ESP ?? 9}', força ~${d.structure.avgBlockMin.FOR ?? 11}' (em ${pct(d.strength.sessionsShare)} das aulas; ${pct(d.strength.withMetconShare)} delas seguidas de metcon), WOD ~${d.structure.avgWodMin}'.
Time domains dos WODs: ${d.timeDomains.map((t) => `${t.label} ${t.range} ${pct(t.share)}`).join(', ')}.
Formatos: ${d.formats.slice(0, 5).map((f) => `${f.format} ${pct(f.share)}`).join(', ')}. WODs em dupla: ${pct(d.partnerShare)}.
Tamanho do WOD: couplet ${pct(d.modality.size['2'])}, triplet ${pct(d.modality.size['3'])}, 4+ movimentos ${pct(d.modality.size['4+'])}.
Carga no WOD (barra, vs carga moderada Rx): ${d.loading.map((l) => `${l.cls} ${pct(l.share)}`).join(', ')}.
Força: séries de 3–5 reps dominam; intensidade típica ${d.strength.avgPctMin}–${d.strength.avgPctMax}% do RM; intervalo mais usado ${d.strength.intervals[0]?.[0] ?? "a cada 2'"}; complexos de LPO ${pct(d.strength.complexShare)}.
Semana: ${d.weekdays.filter((w) => w.sessions).map((w) => `${w.label}: força ${pct(w.strengthShare)}, WOD ${w.avgWodMin}', dupla ${pct(w.partnerShare)}`).join(' | ')}.
Movimentos mais frequentes — ginástica: ${topMoves('G')}. Barra: ${topMoves('W')}. Monoestrutural: ${topMoves('M')}. Objetos: ${topMoves('O')}.

# Assinatura (preservar)
${r.insights.filter((i) => i.tone === 'assinatura').map((i) => `- ${i.title}: ${i.text}`).join('\n')}

# Lacunas (equilibrar quando couber no dia, sem descaracterizar a aula)
${r.insights.filter((i) => i.tone === 'lacuna').map((i) => `- ${i.title}: ${i.text}`).join('\n')}

# Regras
- Os minutos dos blocos somam exatamente ${lesson}.
- Um movimento por linha no conteúdo, com reps e carga F/M em kg: "15 thruster 29/43kg", "400m run", "12/15 cal bike".
- Níveis: RX, Intermediário (~${Math.round(LEVEL_RATIO.INTERMEDIARIO * 100)}% da carga RX), Scale (~${Math.round(LEVEL_RATIO.SCALE * 100)}%), Iniciante. Escalar preserva o estímulo: ajuste carga, movimento e volume, não só o peso.
- Controle de fadiga: sem força pesada do mesmo padrão com menos de 48 h; evite repetir o padrão dominante e o time domain dos dias anteriores; não passe do volume semanal típico.
- Use benchmarks oficiais (Fran, Cindy, heroes) só pelo nome e prescrição corretos; se não tiver certeza, crie um WOD da Nação.
- Orientações ao professor: objetivo, pacing, erros comuns, escala e organização do espaço — é o roteiro de quem dá a aula.
- Em "decisoes", explique cada escolha citando o DNA, as lacunas e os dias anteriores.

# Exemplos reais recentes (formato do histórico: TIPO minutos | título/formato | itens)
${examples}`;
}

export function describeRequest(req: z.output<typeof requestSchema>, recent: Session[], week: Record<WeekMetric, number>, slug: string): string {
  const r = getDnaReport(slug);
  const base = !r.empty && !r.technical ? r.base.metrics : null;
  const wd = WEEKDAYS[weekdayOf(req.date) - 1]!.long;
  const wod = { auto: 'livre (varie em relação aos dias anteriores)', curto: 'curto, até 10 min', medio: 'médio, 11–20 min', longo: 'longo, 21 min ou mais' }[req.wodMinutes];
  const strength = { auto: 'decida pelo DNA do dia da semana e pela semana', sim: 'incluir bloco de força', nao: 'sem bloco de força' }[req.strength];
  const volume = WEEK_METRICS.filter((m) => ['squat', 'hinge', 'push', 'pull', 'jump', 'runM', 'impact'].includes(m.id))
    .map((m) => `${m.label}: ${week[m.id]}${base ? ` (média semanal da Nação ${base[m.id].mean}, P90 ${base[m.id].p90})` : ''}`).join('; ');
  return `Programe a aula de ${wd}, ${formatDateBR(req.date)}.
- Foco pedido pelo coach: ${req.focus || 'nenhum — siga o DNA e equilibre a semana'}
- Força: ${strength}
- Duração do WOD: ${wod}
- Em dupla: ${req.partner ? 'sim' : 'não'}
- Evitar: ${req.avoid || 'nada específico'}

Volume já programado nesta semana (antes deste dia): ${volume}.

Programação dos últimos dias e dos próximos já lançados:
${recent.length ? recent.map(sessionText).join('\n') : '(nenhum dia registrado no período)'}`;
}

/** Plano de exemplo para desenvolvimento sem chave (AI_FAKE=1). */
export function fakePlan(): AiPlan {
  return {
    titulo: 'Força + chipper curto', objetivo: 'Front squat pesado e um WOD curto de ginástica.', estimulo: 'WOD curto (8–10 min), intenso, sem pausas longas.',
    blocos: [
      { tipo: 'MOBILIDADE', minutos: 5, titulo: '', formato: '', timeCapMin: null, conteudo: ['couch stretch', 'ankle rocks'], notasAluno: '', orientacoesProfessor: 'Quadril e tornozelo para o front squat.' },
      { tipo: 'AQUECIMENTO', minutos: 12, titulo: '', formato: '2 rounds', timeCapMin: null, conteudo: ['200m run', '10 air squat', '5 inchworm'], notasAluno: '', orientacoesProfessor: 'Ritmo leve.' },
      { tipo: 'FORCA', minutos: 11, titulo: 'Front squat', formato: "a cada 2' 5 sets 5-5-3-3-3 @70-82%", timeCapMin: null, conteudo: [], notasAluno: 'Suba a carga a cada série.', orientacoesProfessor: 'Cotovelos altos.' },
      { tipo: 'ESPECIFICO', minutos: 9, titulo: 'Pull-up + DU', formato: '', timeCapMin: null, conteudo: ['3x 5 pull-up', '3x 30 DU'], notasAluno: '', orientacoesProfessor: 'Ajuste escalas.' },
      { tipo: 'WOD', minutos: 18, titulo: '', formato: 'For time 21-15-9', timeCapMin: 10, conteudo: ['pull-up', 'DU x2'], notasAluno: 'Sub 8 min.', orientacoesProfessor: 'Quebre cedo os pull-ups.' },
    ],
    escalas: { rx: 'Como prescrito.', intermediario: 'Jumping pull-up.', scale: 'Ring row, single-under.', iniciante: 'Ring row, 30 SU.' },
    decisoes: ['Exemplo local (AI_FAKE): sem chamada ao modelo.'],
  };
}

export interface GenerateResult { plan: AiPlan; check: PlanCheck; model: string }

export async function generateWorkout(principal: Principal | null, slug: string, input: unknown): Promise<GenerateResult> {
  assertCan(principal, 'workout.edit');
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Pedido inválido.');
  const req = parsed.data;
  const modality = programModality(slug);
  const recent = await programmedDays(slug, addDays(req.date, -14), addDays(req.date, 6));
  const weekStart = mondayOf(req.date);
  const week = Object.fromEntries(WEEK_METRICS.map((m) => [m.id, 0])) as Record<WeekMetric, number>;
  for (const s of recent) if (s.date >= weekStart && s.date < req.date) for (const b of s.blocks) { const v = blockVolume(b); if (v) addBlock(week, v); }
  for (const k of Object.keys(week) as WeekMetric[]) week[k] = Math.round(week[k]);

  let plan: AiPlan;
  if (process.env.AI_FAKE === '1') {
    plan = fakePlan();
  } else {
    if (!process.env.ANTHROPIC_API_KEY) throw new AppError('A geração por IA ainda não está configurada (falta a chave ANTHROPIC_API_KEY no servidor).');
    const client = new Anthropic();
    try {
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(AiPlanSchema) },
        system: [{ type: 'text', text: systemPrompt(slug), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: describeRequest(req, recent.filter((s) => s.date !== req.date), week, slug) }],
      });
      if (response.stop_reason === 'refusal') throw new AppError('A IA não gerou este treino. Ajuste o pedido e tente de novo.');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new AppError('A resposta da IA veio incompleta. Tente de novo.');
      plan = response.parsed_output;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new AppError('Muitos pedidos à IA agora. Espere um minuto e tente de novo.');
      if (e instanceof Anthropic.AuthenticationError) throw new AppError('A chave da IA é inválida. Confira ANTHROPIC_API_KEY no servidor.');
      if (e instanceof Anthropic.APIError) throw new AppError(`A IA não respondeu (erro ${e.status ?? 'de conexão'}). Tente de novo.`);
      throw e;
    }
  }

  const r = getDnaReport(slug);
  const check = checkPlan({
    plan, date: req.date, targetMin: lessonMinutes(modality.name), recent,
    weekSoFar: week, baseline: !r.empty && !r.technical ? r.base.metrics : null,
  });
  return { plan, check, model: process.env.AI_FAKE === '1' ? 'exemplo local' : MODEL };
}
