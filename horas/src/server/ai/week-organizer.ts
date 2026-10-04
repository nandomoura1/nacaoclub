import { z } from 'zod/v4';
import { prisma } from '@/server/db';
import { assertAreaAccess, assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AppError, NotFoundError } from '@/server/errors';
import { WEEKDAYS, addDays, formatDateBR, fromUtc, type IsoDate } from '@/domain/dates';
import { lessonMinutes, type WorkoutBlockData, type WorkoutDayData } from '@/domain/workout';
import { hasWrittenDays, parseWeekText } from '@/domain/workout-text';
import { AiBlockSchema, sessionText } from '@/domain/programming/ai-plan';
import { isTechnicalSlug, modalitySlug } from '@/domain/programming/modalities';
import { aiEnabled, askModel, isFake, programmedDays, systemPrompt } from './workout-generator';

/**
 * "Montar a semana pelo texto" no Cadastro de Treino. Com os dias escritos
 * (SEGUNDA…, TERÇA…), o texto do coach vira blocos exatamente como está, sem
 * IA. Só com a ideia central, a IA monta os dias escolhidos pela metodologia
 * da modalidade. Nada é salvo aqui: o coach revisa no editor e salva.
 */

/** Modalidades com IA (o mesmo conjunto da Geração de Treino IA). */
export const WEEK_AI = new Set(['crossfit', 'funcional', 'hyrox', 'futevolei']);

const AiWeekSchema = z.object({
  tema: z.string().describe('Intenção / ideia central da semana, curta (até 60 caracteres). Ex.: "Levantada".'),
  dias: z.array(z.object({
    data: z.string().describe('Data do dia no formato AAAA-MM-DD, uma das datas pedidas.'),
    titulo: z.string().describe('Destaque do dia (até 40 caracteres): o recorte da ideia central trabalhado nesse dia. Ex.: "Levantada de chapa".'),
    blocos: z.array(AiBlockSchema),
  })),
});
type AiWeek = z.infer<typeof AiWeekSchema>;

export interface OrganizedWeek {
  mode: 'texto' | 'ia';
  theme: string | null;
  days: WorkoutDayData[];
  warnings: string[];
}

const toBlock = (b: AiWeek['dias'][number]['blocos'][number]): WorkoutBlockData => ({
  kind: b.tipo,
  title: b.titulo.trim().slice(0, 80) || null,
  durationMin: b.minutos > 0 ? Math.min(b.minutos, 300) : null,
  format: b.formato.trim().slice(0, 120) || null,
  timeCapMin: b.timeCapMin && b.timeCapMin > 0 ? Math.min(b.timeCapMin, 300) : null,
  content: b.conteudo.map((l) => l.trim()).filter(Boolean).join('\n').slice(0, 2000) || null,
  notes: b.notasAluno.trim().slice(0, 300) || null,
  coachNotes: b.orientacoesProfessor.trim().slice(0, 1000) || null,
});

/** Semana de exemplo (AI_FAKE=1), sem chamar o modelo. */
export function fakeWeek(idea: string, dates: IsoDate[], technical: boolean): AiWeek {
  const tema = idea.split(/\r?\n/)[0]!.replace(/^.*?[:\-–—]\s*/, '').trim().slice(0, 60) || 'Ideia central';
  const blk = (tipo: AiWeek['dias'][number]['blocos'][number]['tipo'], minutos: number, titulo: string, conteudo: string[]) =>
    ({ tipo, minutos, titulo, formato: '', timeCapMin: null, conteudo, notasAluno: '', orientacoesProfessor: 'Exemplo local (AI_FAKE).' });
  return {
    tema,
    dias: dates.map((data, i) => ({
      data,
      titulo: `${tema} · parte ${i + 1}`.slice(0, 40),
      blocos: technical
        ? [blk('AQUECIMENTO', 12, 'Dinâmica com enquadramento', [`Quadrinha com foco em ${tema.toLowerCase()}`]), blk('FUNDAMENTO', 23, tema, ['Fundamento isolado em duplas', 'Com deslocamento']), blk('JOGO', 20, 'Dinâmica de jogo com regras', [`Ponto vale 2 com ${tema.toLowerCase()}`])]
        : [blk('AQUECIMENTO', 12, '', ['400m run', '10 air squat']), blk('ESPECIFICO', 8, tema, ['Técnica do tema']), blk('WOD', 30, '', ['AMRAP 20\'', '10 wall ball'])],
    })),
  };
}

export async function organizeWeekText(
  principal: Principal | null, weekId: string, input: { text: string; weekdays: number[] },
): Promise<OrganizedWeek> {
  assertCan(principal, 'workout.edit');
  const text = (input.text ?? '').trim();
  if (text.length < 3) throw new AppError('Escreva a ideia central ou a semana.');
  if (text.length > 8000) throw new AppError('Texto longo demais (máximo de 8.000 caracteres).');
  const w = await prisma.workoutWeek.findUnique({ where: { id: weekId }, include: { modality: { select: { name: true, areaId: true } } } });
  if (!w) throw new NotFoundError('Semana de treinos não encontrada.');
  assertAreaAccess(principal, w.modality.areaId);
  const weekStart = fromUtc(w.weekStart);

  if (hasWrittenDays(text)) {
    const r = parseWeekText(text, weekStart);
    return { mode: 'texto', ...r };
  }

  const slug = modalitySlug(w.modality.name);
  if (!WEEK_AI.has(slug)) {
    throw new AppError(`Para ${w.modality.name}, escreva os dias (SEGUNDA…, TERÇA…) com as seções: a IA ainda não monta semanas desta modalidade.`);
  }
  if (!aiEnabled()) throw new AppError('A IA ainda não está ligada neste servidor. Escreva os dias (SEGUNDA…, TERÇA…) que o sistema organiza sem IA.');
  const weekdays = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort();
  if (!weekdays.length) throw new AppError('Escolha os dias da semana.');
  const dates = weekdays.map((d) => addDays(weekStart, d - 1));
  const technical = isTechnicalSlug(slug);

  let plan: AiWeek;
  if (isFake()) {
    plan = fakeWeek(text, dates, technical);
  } else {
    const recent = await programmedDays(slug, addDays(weekStart, -14), addDays(weekStart, -1));
    const lesson = lessonMinutes(w.modality.name) ?? 55;
    const user = `Agora monte a SEMANA de ${w.modality.name} de ${formatDateBR(weekStart)} a ${formatDateBR(addDays(weekStart, 6))}, um plano de aula por dia, só nestas datas:
${dates.map((d, i) => `- ${WEEKDAYS[weekdays[i]! - 1]!.long}, ${d}`).join('\n')}

Ideia central / pedido do coach (prioridade máxima — mantenha o que ele já descreveu):
"""
${text}
"""

Como organizar:
- "tema" = a intenção da semana, curta.
- Cada dia trabalha um recorte diferente da ideia central, numa progressão ao longo da semana (do mais simples ao mais complexo), e "titulo" do dia diz esse recorte.
- Os minutos de cada dia somam exatamente ${lesson}.${technical ? `
- Cada dia: MOBILIDADE (opcional, título "4 exercícios" ou a lista), AQUECIMENTO com título "Dinâmica de jogo com enquadramento" (quadrinha/enquadramento já com o recorte do dia), FUNDAMENTO (a execução do recorte, em progressão; adaptações para turmas de nível acima quando couber) e JOGO com título "Dinâmica de jogo com regras" (a regra reforça o recorte do dia: ponto que vale mais, só vale com o fundamento, pagamento de polichinelos etc.).` : ''}
- Escreva como o coach escreve: frases curtas e práticas, uma por item de conteúdo.
- Não preencha escalas, objetivo, estímulo nem decisões: aqui só existem tema, dias e blocos.

Aulas das duas semanas anteriores (para não repetir e dar sequência):
${recent.length ? recent.map(sessionText).join('\n') : '(nenhuma aula registrada)'}`;
    plan = await askModel(AiWeekSchema, await systemPrompt(slug), user, 24000);
  }

  const warnings: string[] = [];
  const days: WorkoutDayData[] = [];
  for (const d of plan.dias) {
    if (!dates.includes(d.data)) { warnings.push(`A IA propôs ${d.data}, fora dos dias escolhidos: ficou de fora.`); continue; }
    if (days.some((x) => x.date === d.data)) continue;
    days.push({ date: d.data, title: d.titulo.trim().slice(0, 40) || null, blocks: d.blocos.slice(0, 12).map(toBlock) });
  }
  for (const d of dates) if (!days.some((x) => x.date === d)) warnings.push(`A IA não montou ${formatDateBR(d).slice(0, 5)}.`);
  return { mode: 'ia', theme: plan.tema.trim().slice(0, 120) || null, days: days.sort((a, b) => a.date.localeCompare(b.date)), warnings };
}
