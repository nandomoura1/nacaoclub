import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { z as z4 } from 'zod/v4';
import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { AppError } from '@/server/errors';
import { addDays, formatDateBR, fromUtc, isIsoDate, toUtc, weekdayOf, WEEKDAYS, type IsoDate } from '@/domain/dates';
import { lessonMinutes, mondayOf, type BlockKind } from '@/domain/workout';
import { parseHistory, type Session } from '@/domain/programming/history';
import { CROSSFIT_HISTORY, FUNCIONAL_HISTORY, HYROX_HISTORY } from '@/domain/programming/history.generated';
import { AiPlanSchema, checkPlan, dayToSession, sessionText, type AiPlan, type PlanCheck } from '@/domain/programming/ai-plan';
import { isTechnicalSlug, modalitySlug, programModality } from '@/domain/programming/modalities';
import { fundamentalLabel, type TechnicalSession } from '@/domain/programming/technical';
import { addBlock, WEEK_METRICS, type WeekMetric } from '@/domain/programming/volume';
import { blockVolume } from '@/domain/programming/calculator';
import { LEVEL_RATIO } from '@/domain/programming/taxonomy';
import type { Dna } from '@/domain/programming/dna';
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
  /** Janela de programação recente que a IA considera: 14 ou 30 dias. */
  window: z.coerce.number().refine((n) => n === 14 || n === 30, 'Janela inválida.').default(14),
});
export type GenerateRequest = z.input<typeof requestSchema>;

const HISTORY: Record<string, string> = { crossfit: CROSSFIT_HISTORY, funcional: FUNCIONAL_HISTORY, hyrox: HYROX_HISTORY };

/** O que muda no prompt de cada modalidade: vocabulário, estrutura da aula e regras próprias. */
const FLAVOR: Record<string, { language: string; structure: (d: Dna) => string; loading: (d: Dna) => string; rules: string }> = {
  crossfit: {
    language: 'com os nomes de movimentos em inglês como a Nação usa ("thruster", "pull-up", "wall ball")',
    structure: (d) => `mobilidade ~5', warm-up ~${d.structure.avgBlockMin.WU ?? 12}', específico/técnica ~${d.structure.avgBlockMin.ESP ?? 9}', força ~${d.structure.avgBlockMin.FOR ?? 11}' (em ${pct(d.strength.sessionsShare)} das aulas; ${pct(d.strength.withMetconShare)} delas seguidas de metcon), WOD ~${d.structure.avgWodMin}'`,
    loading: (d) => `Carga no WOD (barra, vs carga moderada Rx): ${d.loading.map((l) => `${l.cls} ${pct(l.share)}`).join(', ')}.
Força: séries de 3–5 reps dominam; intensidade típica ${d.strength.avgPctMin}–${d.strength.avgPctMax}% do RM; intervalo mais usado ${d.strength.intervals[0]?.[0] ?? "a cada 2'"}; complexos de LPO ${pct(d.strength.complexShare)}.`,
    rules: '- Use benchmarks oficiais (Fran, Cindy, heroes) só pelo nome e prescrição corretos; se não tiver certeza, crie um WOD da Nação.',
  },
  funcional: {
    language: 'com o vocabulário que os professores do Funcional usam, misturando português e inglês ("meio sugado", "perdigueiro", "remada TRX", "Double Db Snatch", "KB swing", "polichinelo")',
    structure: (d) => `warm-up ~${Math.round(d.structure.avgBlockMin.WU ?? 12)}' (em quase toda aula, com mobilidade dentro), específico ~${Math.round(d.structure.avgBlockMin.ESP ?? 6)}' passando exercício por exercício, WOD ~${Math.round(d.structure.avgWodMin ?? 25)}' e, às vezes, acessório/core ~${Math.round(d.structure.avgBlockMin.ACC ?? 9)}'. Força estruturada é rara (${pct(d.strength.sessionsShare)} das aulas)`,
    loading: () => 'Carga: implementos (halteres, KB, medicine ball, anilha) em peso moderado para muitas repetições com boa técnica; quando houver bloco de força, 3–4 séries de 8–12 reps com halteres/KB.',
    rules: `- É FUNCIONAL, não CrossFit: implementos leves e médios (halteres, KB, medicine ball, slam ball, anilha, TRX, caixa, corda, bike/remo, corrida), barra só leve/moderada em movimentos simples (deadlift, SDHP, push press), sem LPO pesado e sem ginástica avançada (muscle-up, HSPU, rope climb, T2B). Movimentos simples de executar bem em turma grande.
- O circuito é a casa: EMOM, "a cada X'", intervalado (on/off) e rounds; for time e AMRAP também aparecem. Prefira WODs longos (21–35') e contínuos, variando com tiros curtos quando a semana pedir.
- Core em quase toda aula (prancha, perdigueiro, abdominal, escalador) e mais puxar (remadas) para equilibrar o empurrar.
- Carga por implemento, escrita F/M: "12 KB swing 12/16kg", "10 Double Db Snatch 2x10/2x15kg", "15 wall ball 4/6kg". Sem % de RM.
- Os níveis ajustam implemento, amplitude e ritmo; sem benchmarks de CrossFit.`,
  },
  hyrox: {
    language: 'com os nomes das estações e movimentos como a prova usa ("SkiErg", "sled push", "sled pull", "burpee broad jump", "row", "farmers carry", "sandbag lunges", "wall ball")',
    structure: (d) => `warm-up ~${Math.round(d.structure.avgBlockMin.WU ?? 10)}' (sempre, com mobilidade e ativação), específico ~${Math.round(d.structure.avgBlockMin.ESP ?? 6)}' (técnica da estação do dia ou ritmo de corrida) e WOD ~${Math.round(d.structure.avgWodMin ?? 26)}'. Força estruturada quase não aparece (${pct(d.strength.sessionsShare)} das aulas)`,
    loading: () => 'Carga de referência = pesos oficiais HYROX, F/M. Open: sled push 102/152kg, sled pull 78/103kg (com o trenó), farmers carry 2x16/2x24kg, sandbag lunges 10/20kg, wall ball 4/6kg. Pro: sled push 152/202kg, sled pull 103/153kg, farmers 2x24/2x32kg, sandbag 20/30kg, wall ball 6/9kg. Em treino, sled e sandbag podem ficar abaixo do peso de prova para manter o ritmo.',
    rules: `- É HYROX: a prova é 8 × (1 km de corrida + 1 estação), nesta ordem: SkiErg 1.000 m, sled push 50 m, sled pull 50 m, burpee broad jump 80 m, row 1.000 m, farmers carry 200 m, sandbag lunges 100 m, wall ball 100 reps. Toda aula prepara para ela.
- Corrida em quase toda aula, e de preferência compromissada: correr entre as estações, cansado, como na prova (ex.: "400m run" + estação, em rounds). Distâncias em metros.
- O estímulo é resistência: WODs longos (21–40') em EMOM/"a cada", for time e intervalado; tiros curtos (até 5') 1×/semana no máximo para ritmo de prova.
- Distribua as 8 estações na semana e priorize as pouco treinadas (lacunas abaixo); lunge com sandbag/DB, não só peso corporal.
- Escreva estações por distância/reps como na prova (frações dela no treino: "25m sled push", "250m ski", "20m burpee broad jump", "50 wall ball 4/6kg").
- Níveis: RX = pesos Open (Pro para quem compete na Pro); Intermediário e Scale reduzem peso do sled/sandbag e as distâncias; Iniciante troca corrida por bike/remo se precisar. Sem benchmarks de CrossFit.`,
  },
};

/** Dias programados da modalidade entre duas datas: banco (Cadastro de Treino) por cima do histórico. */
export async function programmedDays(slug: string, from: IsoDate, to: IsoDate): Promise<Session[]> {
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

const pct = (n: number) => `${String(n).replace('.', ',')}%`;

/** Modalidades técnicas com geração por IA (a base são planos de aula, não WODs). */
const TECHNICAL_AI = new Set(['futevolei']);

const planText = (s: TechnicalSession) => [
  `## ${s.id} · ${s.fase ?? ''} · ${s.dia ?? ''} — ${s.tema}`,
  `Objetivo: ${s.objetivo}`,
  s.aquecimento?.length ? `Aquecimento: ${s.aquecimento.join('; ')}` : '',
  `Fundamentos: ${s.fundamentos.join('; ')}`,
  `Progressão: ${s.progressao.join(' → ')}`,
  s.dinamica_jogo ? `Jogo: ${s.dinamica_jogo.descricao} Regra: ${s.dinamica_jogo.regra}` : s.mini_jogo ? `Jogo: ${s.mini_jogo}` : '',
  (s.foco_coaching ?? s.coaching)?.length ? `Foco do professor: ${(s.foco_coaching ?? s.coaching)!.join('; ')}` : '',
  s.conceito ? `Conceito: ${s.conceito}` : '',
].filter(Boolean).join('\n');

/** Prompt das modalidades técnicas: metodologia, fases, fundamentos, progressão e jogo condicionado. */
async function technicalPrompt(slug: string): Promise<string> {
  const r = await getDnaReport(slug);
  if (r.empty || !r.technical || !TECHNICAL_AI.has(slug)) throw new AppError('Esta modalidade ainda não tem geração de treino.');
  const d = r.dna;
  const m = d.methodology;
  const lesson = lessonMinutes(r.modality.name) ?? 55;
  const lv = m.padrao_entrega_professor.adaptacao_niveis;
  return `Você é o copiloto de programação do Head Coach do ${r.modality.name} da Nação Club (Brasília). Você propõe o plano de aula de um dia; o coach revisa e decide. Escreva em português do Brasil, com o vocabulário da ${m.nome} (enquadramento, recepção, levantamento/construção, chapa, peito, cabeça, ataque, defesa, jogo condicionado).

# ${m.nome} (base de ${d.sessions} planos de aula)
Princípios:
${m.principios.map((p) => `- ${p}`).join('\n')}
Fases metodológicas: ${d.phases.map((p) => `${p.phase} ${pct(p.share)}`).join(', ')}.
Fundamentos mais trabalhados: ${d.fundamentals.slice(0, 8).map((f) => `${f.label} ${pct(f.share)}`).join(', ')}.${d.missing.length ? ` Fora da base: ${d.missing.map(fundamentalLabel).join(', ')}.` : ''}
Progressão: ~${String(d.progression.avgSteps).replace('.', ',')} etapas por aula; ${pct(d.progression.endsInGame)} terminam em construção, ataque ou jogo; ${pct(d.progression.startsIsolated)} começam com o fundamento isolado.
Regras de jogo condicionado mais usadas: ${d.rules.slice(0, 6).map(([rule]) => rule).join('; ')}.
Foco do professor mais frequente: ${d.coaching.slice(0, 8).map(([c]) => c).join('; ')}.
Semana: ${d.weekdays.map((w) => `${w.day}: ${w.phases.join(', ')}`).join(' | ')}.
Entrega do professor: ${m.padrao_entrega_professor.energia_alta} Feedback ${m.padrao_entrega_professor.feedback.join(' → ')}. ${m.padrao_entrega_professor.uso_nome_aluno}
Níveis: aprendiz (D/C) — ${lv.aprendiz_D_C ?? ''}; intermediário — ${lv.intermediario ?? ''}; avançado — ${lv.avancado ?? ''}

# Assinatura (preservar)
${r.insights.filter((i) => i.tone === 'assinatura').map((i) => `- ${i.title}: ${i.text}`).join('\n')}

# Lacunas (equilibrar quando couber no dia)
${r.insights.filter((i) => i.tone === 'lacuna').map((i) => `- ${i.title}: ${i.text}`).join('\n')}

# Regras
- Os minutos dos blocos somam exatamente ${lesson}.
- Use só os tipos MOBILIDADE (opcional, ~4 exercícios), AQUECIMENTO (enquadramento e bola desde o início), FUNDAMENTO (o tema do dia) e JOGO (jogo condicionado). Nada de WOD, força ou carga.
- Um tema e um fundamento central por aula, ligado a uma fase da metodologia. Em FUNDAMENTO, cada linha do conteúdo é uma etapa da progressão, do simples (bola previsível, fundamento isolado) ao complexo (variação, deslocamento, decisão), com a organização: duplas/trios, quem lança, filas curtas, repetições ou tempo.
- JOGO: título com o nome do jogo, a regra no formato (ex.: "ponto só vale se a recepção chegar no levantador") e a pontuação no conteúdo. A regra precisa reforçar o tema do dia.
- orientacoesProfessor: 3 focos de coaching, erros comuns, organização da quadra e o padrão de entrega (feedback ${m.padrao_entrega_professor.feedback.join(' → ')}; nome do aluno 4+ vezes).
- escalas: rx = Avançado, intermediario = Intermediário, scale = Aprendiz (D/C), iniciante = Primeira aula. Mesma meta técnica, complexidade ajustada (bola mais previsível, menos deslocamento, sem decisão para quem está começando).
- estimulo = o objetivo técnico/tático da aula e o conceito (ex.: "Receber → deslocar → construir → atacar").
- Siga a fase da semana (uma fase por semana, como a Nação faz). Se o dia anterior teve o mesmo tema, avance a progressão (mais deslocamento, decisão, transição) em vez de repetir igual; traga o que a base não cobre (lacunas) quando couber.
- Em "decisoes", explique cada escolha citando a metodologia, as lacunas e os dias anteriores.

# Planos de aula reais da Nação
${[...r.dataset.sessoes.slice(0, 8), ...r.dataset.sessoes.slice(8).slice(-6)].map(planText).join('\n\n')}`;
}

/** Parte estável do prompt (cacheável): quem é o copiloto e o DNA da modalidade. */
export async function systemPrompt(slug: string): Promise<string> {
  if (isTechnicalSlug(slug)) return technicalPrompt(slug);
  const r = await getDnaReport(slug);
  if (r.empty || r.technical) throw new AppError('Esta modalidade ainda não tem geração de treino.');
  const flavor = FLAVOR[slug];
  if (!flavor) throw new AppError('Esta modalidade ainda não tem geração de treino.');
  const d = r.dna;
  const lesson = lessonMinutes(r.modality.name) ?? 55;
  const topMoves = (mod: string) => d.movements.filter((m) => m.modality === mod).slice(0, 10).map((m) => `${m.name} ${String(m.perWeek).replace('.', ',')}/sem`).join('; ');
  // Aulas mais recentes da base (inclui as lançadas no Cadastro de Treino): a IA aprende com o que o coach programa.
  const examples = r.recent.map(sessionText).join('\n');
  return `Você é o copiloto de programação do Head Coach do ${r.modality.name} da Nação Club (Brasília). Você propõe o plano de aula de um dia; o coach revisa e decide. Escreva em português do Brasil, ${flavor.language}.

# Como a Nação programa (DNA medido em ${d.period.sessions} aulas, ${d.period.weeks} semanas)
Aula de ${lesson} minutos. Estrutura típica: ${flavor.structure(d)}.
Time domains dos WODs: ${d.timeDomains.map((t) => `${t.label} ${t.range} ${pct(t.share)}`).join(', ')}.
Formatos: ${d.formats.slice(0, 5).map((f) => `${f.format} ${pct(f.share)}`).join(', ')}. WODs em dupla: ${pct(d.partnerShare)}.
Tamanho do WOD: couplet ${pct(d.modality.size['2'])}, triplet ${pct(d.modality.size['3'])}, 4+ movimentos ${pct(d.modality.size['4+'])}.
${flavor.loading(d)}
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
${flavor.rules}
- Orientações ao professor: objetivo, pacing, erros comuns, escala e organização do espaço — é o roteiro de quem dá a aula.
- Em "decisoes", explique cada escolha citando o DNA, as lacunas e os dias anteriores.

# Exemplos reais recentes (formato do histórico: TIPO minutos | título/formato | itens)
${examples}`;
}

export async function describeRequest(req: z.output<typeof requestSchema>, recent: Session[], week: Record<WeekMetric, number>, slug: string, extraContext = ''): Promise<string> {
  if (isTechnicalSlug(slug)) {
    return `Programe a aula de ${WEEKDAYS[weekdayOf(req.date) - 1]!.long}, ${formatDateBR(req.date)}.
- Tema/fundamento pedido pelo coach: ${req.focus || 'nenhum — siga a metodologia, a fase da semana e equilibre os fundamentos'}
- Evitar: ${req.avoid || 'nada específico'}

${extraContext ? `${extraContext}\n\n` : ''}Aulas dos últimos ${req.window} dias e dos próximos já lançadas:
${recent.length ? recent.map(sessionText).join('\n') : '(nenhuma aula registrada no período)'}`;
  }
  const r = await getDnaReport(slug);
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

${extraContext ? `${extraContext}\n\n` : ''}Programação dos últimos ${req.window} dias e dos próximos já lançados:
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

/** Aula técnica de exemplo (AI_FAKE=1). */
export function fakeTechnicalPlan(): AiPlan {
  const blank = { formato: '', timeCapMin: null, notasAluno: '' };
  return {
    titulo: 'Recepção livre + construção', objetivo: 'Primeira bola de qualidade para construir o ponto.', estimulo: 'Receber → deslocar → construir → atacar.',
    blocos: [
      { ...blank, tipo: 'MOBILIDADE', minutos: 5, titulo: '', conteudo: ['Tornozelo', 'Quadril', 'Coluna torácica', 'Ombro'], orientacoesProfessor: 'Chame cada aluno pelo nome.' },
      { ...blank, tipo: 'AQUECIMENTO', minutos: 10, titulo: 'Enquadramento', conteudo: ['Duplas: controle com fundamentos livres', 'Enquadrar antes do contato'], orientacoesProfessor: 'Observar → corrigir → incentivar → repetir.' },
      { ...blank, tipo: 'FUNDAMENTO', minutos: 20, titulo: 'Recepção livre', conteudo: ['Bola previsível, trios, 10 repetições por aluno', 'Variação de direção e altura', 'Recepção + construção'], orientacoesProfessor: 'Filas curtas, alta repetição.' },
      { ...blank, tipo: 'JOGO', minutos: 20, titulo: 'Primeira bola vale dobro', formato: 'Jogo condicionado começando pela recepção', conteudo: ['Ponto normal: 1', 'Recepção que chega no levantador e vira ataque: 2'], orientacoesProfessor: 'Regra reforça o tema.' },
    ],
    escalas: { rx: 'Recepção com decisão e transição.', intermediario: 'Recepção + deslocamento.', scale: 'Enquadramento e domínio básico.', iniciante: 'Bola na mão do lançador, só enquadrar e tocar.' },
    decisoes: ['Exemplo local (AI_FAKE): sem chamada ao modelo.'],
  };
}

export interface GenerateResult { plan: AiPlan; check: PlanCheck; model: string }

export const isFake = () => process.env.AI_FAKE === '1';

/** Chamada ao modelo com saída estruturada (schema zod v4) e erros traduzidos para o coach. */
export async function askModel<S extends z4.ZodType>(schema: S, system: string, user: string, maxTokens = 16000): Promise<z4.infer<S>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AppError('A geração por IA ainda não está configurada (falta a chave ANTHROPIC_API_KEY no servidor).');
  // Abaixo do limite da função na Vercel (300 s); com timeout explícito o SDK aceita max_tokens alto sem streaming.
  const client = new Anthropic({ timeout: 280_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') throw new AppError('A IA não gerou este pedido. Ajuste e tente de novo.');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new AppError('A resposta da IA veio incompleta. Tente de novo.');
    return response.parsed_output as z4.infer<S>;
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AppError('A IA demorou demais para responder. Tente de novo (ou um período menor).');
    if (e instanceof Anthropic.RateLimitError) throw new AppError('Muitos pedidos à IA agora. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.AuthenticationError) throw new AppError('A chave da IA é inválida. Confira ANTHROPIC_API_KEY no servidor.');
    if (e instanceof Anthropic.APIError) throw new AppError(`A IA não respondeu (erro ${e.status ?? 'de conexão'}). Tente de novo.`);
    throw e;
  }
}

/** Volume da semana do dia, antes dele. */
function weekVolume(recent: Session[], date: IsoDate): Record<WeekMetric, number> {
  const weekStart = mondayOf(date);
  const week = Object.fromEntries(WEEK_METRICS.map((m) => [m.id, 0])) as Record<WeekMetric, number>;
  for (const s of recent) if (s.date >= weekStart && s.date < date) for (const b of s.blocks) { const v = blockVolume(b); if (v) addBlock(week, v); }
  for (const k of Object.keys(week) as WeekMetric[]) week[k] = Math.round(week[k]);
  return week;
}

/**
 * Aula de um dia. `extraContext` (planilha: estratégia, fase, tema do dia) e
 * `extraDays` (dias da planilha já gerados e ainda não lançados) entram no contexto.
 */
export async function generateWorkout(
  principal: Principal | null, slug: string, input: unknown,
  opts: { extraContext?: string; extraDays?: Session[] } = {},
): Promise<GenerateResult> {
  assertCan(principal, 'workout.edit');
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Pedido inválido.');
  const req = parsed.data;
  const modality = programModality(slug);
  const byDate = new Map((await programmedDays(slug, addDays(req.date, -req.window), addDays(req.date, 6))).map((s) => [s.date, s]));
  for (const s of opts.extraDays ?? []) if (s.date >= addDays(req.date, -req.window) && s.date <= addDays(req.date, 6)) byDate.set(s.date, s);
  const recent = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const week = weekVolume(recent, req.date);

  const technical = isTechnicalSlug(slug);
  const plan: AiPlan = isFake()
    ? (technical ? fakeTechnicalPlan() : fakePlan())
    : await askModel(AiPlanSchema, await systemPrompt(slug), await describeRequest(req, recent.filter((s) => s.date !== req.date), week, slug, opts.extraContext));

  const r = await getDnaReport(slug);
  const check = checkPlan({
    plan, date: req.date, targetMin: lessonMinutes(modality.name), recent: recent.filter((s) => s.date !== req.date),
    weekSoFar: technical ? {} : week, baseline: !r.empty && !r.technical ? r.base.metrics : null,
  });
  return { plan, check, model: isFake() ? 'exemplo local' : MODEL };
}
