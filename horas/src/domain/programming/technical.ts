/**
 * DNA de modalidades técnicas (Futevôlei, Base Forte): a base não são WODs,
 * são planos de aula — tema, fase, fundamentos, progressão, jogo condicionado
 * e foco do professor. O diagnóstico mede o que a metodologia prioriza e o
 * que fica de fora.
 */

type Block = string | { nome: string; duracao?: number; conteudo?: string[] };
export interface TechnicalSession {
  id: string;
  tema: string;
  objetivo: string;
  fase?: string;
  dia?: string;
  duracao_minutos?: number;
  mobilidade?: { quantidade_exercicios?: number };
  aquecimento?: string[];
  blocos?: Block[];
  fundamentos: string[];
  progressao: string[];
  dinamica_jogo?: { descricao: string; regra: string };
  mini_jogo?: string;
  foco_coaching?: string[];
  coaching?: string[];
  conceito?: string;
}
export interface TechnicalDataset {
  dataset: string;
  metodologia: {
    nome: string;
    principios: string[];
    padrao_entrega_professor: { energia_alta: string; feedback: string[]; uso_nome_aluno: string; adaptacao_niveis: Record<string, string> };
  };
  fases_metodologicas?: string[];
  caracteristica?: string;
  sessoes: TechnicalSession[];
}

/** Fundamento do texto livre → família canônica. A ordem importa. */
const FUNDAMENTALS: { id: string; label: string; re: RegExp }[] = [
  { id: 'recepcao', label: 'Recepção', re: /recep/i },
  { id: 'defesa', label: 'Defesa', re: /defes|marca[çc][ãa]o/i },
  { id: 'ataque', label: 'Ataque', re: /ataque|envio/i },
  { id: 'levantamento', label: 'Levantamento / construção', re: /levant|constru/i },
  { id: 'chapa', label: 'Chapa', re: /chapa/i },
  { id: 'peito', label: 'Peito', re: /peit(o|ada)(?! do p[ée])/i },
  { id: 'cabeca', label: 'Cabeça', re: /cabe[çc]a/i },
  { id: 'ombro', label: 'Ombro', re: /ombro/i },
  { id: 'peito-pe', label: 'Peito do pé', re: /peito do p[ée]/i },
  { id: 'curtos', label: 'Fundamentos curtos', re: /fundamentos curtos|pingo/i },
];
/** Fundamentos clássicos do futevôlei, para achar o que a base não cobre [HIPÓTESE: repertório técnico da modalidade]. */
export const FUTEVOLEI_REPERTOIRE = ['recepcao', 'levantamento', 'ataque', 'defesa', 'chapa', 'peito', 'cabeca', 'ombro', 'peito-pe', 'saque'];
const EXTRA_LABEL: Record<string, string> = { saque: 'Saque' };

export function fundamentalsOf(s: TechnicalSession): string[] {
  const text = [...s.fundamentos, s.tema].join(' · ');
  return FUNDAMENTALS.filter((f) => f.re.test(text)).map((f) => f.id);
}
export const fundamentalLabel = (id: string) => FUNDAMENTALS.find((f) => f.id === id)?.label ?? EXTRA_LABEL[id] ?? id;

/** Tipo de regra do jogo condicionado. */
export function ruleKind(s: TechnicalSession): string {
  const r = `${s.dinamica_jogo?.regra ?? ''} ${s.dinamica_jogo?.descricao ?? ''} ${s.mini_jogo ?? ''}`.toLowerCase();
  if (/ponto .*2|pontua[çc][ãa]o extra|valorizar/.test(r)) return 'Pontuação dobrada para o fundamento';
  if (/n[ãa]o pode|deve ser|obrigat/.test(r)) return 'Restrição técnica (ataque/fundamento obrigatório)';
  if (/polichinel/.test(r)) return 'Penalidade física pelo erro';
  if (/gatilho|iniciad|iniciando|come[çc]a/.test(r)) return 'Jogo iniciado pelo fundamento';
  return 'Jogo livre / continuidade';
}

/** Nome do bloco do plano de aula → etapa canônica. */
function blockName(raw: string): string {
  const t = raw.toLowerCase();
  if (/mobilidade/.test(t)) return 'Mobilidade + ativação';
  if (/t[ée]cnica/.test(t)) return 'Técnica do fundamento';
  if (/mini jogo/.test(t)) return 'Mini jogos';
  if (/situa/.test(t)) return 'Situações de jogo';
  if (/desafio/.test(t)) return 'Desafio';
  if (/espec[ií]fico/.test(t)) return 'Específico';
  if (/ataque/.test(t)) return 'Levantada + ataque';
  if (/desloca/.test(t)) return 'Deslocamento + fundamento';
  if (/controle|direcion|posicion|dom[ií]nio/.test(t)) return 'Controle e direcionamento';
  return raw;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const top = (c: Record<string, number>, n = 99) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);

export interface TechnicalDna {
  sessions: number;
  methodology: TechnicalDataset['metodologia'];
  phases: { phase: string; count: number; share: number }[];
  fundamentals: { id: string; label: string; count: number; share: number }[];
  missing: string[];
  rules: [string, number][];
  coaching: [string, number][];
  progression: { avgSteps: number; endsInGame: number; startsIsolated: number };
  weekdays: { day: string; phases: string[] }[];
  blocks: { name: string; count: number; avgMin: number | null }[];
  withDuration: number;
  concepts: string[];
}

export function computeTechnicalDna(ds: TechnicalDataset): TechnicalDna {
  const ss = ds.sessoes;
  const phase: Record<string, number> = {};
  const fund: Record<string, number> = {};
  const rules: Record<string, number> = {};
  const coach: Record<string, number> = {};
  const byDay: Record<string, Set<string>> = {};
  const blocks: Record<string, { n: number; min: number[] }> = {};
  let steps = 0, game = 0, isolated = 0, withDuration = 0;
  for (const s of ss) {
    if (s.fase) phase[s.fase] = (phase[s.fase] ?? 0) + 1;
    for (const f of new Set(fundamentalsOf(s))) fund[f] = (fund[f] ?? 0) + 1;
    const rk = ruleKind(s);
    rules[rk] = (rules[rk] ?? 0) + 1;
    for (const c of [...(s.foco_coaching ?? []), ...(s.coaching ?? [])]) coach[c] = (coach[c] ?? 0) + 1;
    if (s.dia && s.fase) (byDay[s.dia] ??= new Set()).add(s.fase);
    steps += s.progressao.length;
    const last = (s.progressao.at(-1) ?? '').toLowerCase();
    if (/jogo|ataque|constru|continuidade|→/.test(last)) game++;
    if (/parad|isolad|estacion|sem bola|posi|contato|controle|quadrinha|receber|movimento|alto volume|organiza|defesa$/.test((s.progressao[0] ?? '').toLowerCase())) isolated++;
    if (s.duracao_minutos) withDuration++;
    const seen = new Set<string>();
    for (const b of s.blocos ?? []) {
      const name = blockName(typeof b === 'string' ? b : b.nome);
      const cur = (blocks[name] ??= { n: 0, min: [] });
      if (!seen.has(name)) cur.n++; // uma vez por aula
      seen.add(name);
      if (typeof b !== 'string' && b.duracao) cur.min.push(b.duracao);
    }
  }
  const covered = new Set(Object.keys(fund));
  const order = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return {
    sessions: ss.length,
    methodology: ds.metodologia,
    phases: (ds.fases_metodologicas ?? Object.keys(phase)).map((p) => ({ phase: p, count: phase[p] ?? 0, share: pct(phase[p] ?? 0, ss.length) })),
    fundamentals: top(fund).map(([id, n]) => ({ id, label: fundamentalLabel(id), count: n, share: pct(n, ss.length) })),
    missing: FUTEVOLEI_REPERTOIRE.filter((f) => !covered.has(f)),
    rules: top(rules),
    coaching: top(coach, 12),
    progression: { avgSteps: Math.round((steps / Math.max(1, ss.length)) * 10) / 10, endsInGame: pct(game, ss.length), startsIsolated: pct(isolated, ss.length) },
    weekdays: order.filter((d) => byDay[d]).map((d) => ({ day: d.replace('-feira', ''), phases: [...byDay[d]!] })),
    blocks: top(Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, v.n]))).map(([name, n]) => {
      const m = blocks[name]!.min;
      return { name, count: n, avgMin: m.length ? Math.round(m.reduce((a, x) => a + x, 0) / m.length) : null };
    }),
    withDuration,
    concepts: ss.map((s) => s.conceito).filter((c): c is string => !!c),
  };
}

export interface TechnicalInsight { tone: 'assinatura' | 'lacuna'; title: string; text: string }

export function technicalInsights(slug: string, d: TechnicalDna): TechnicalInsight[] {
  const c = (s: string) => s.replace(/(\d)\.(\d)/g, '$1,$2');
  const out: TechnicalInsight[] = [];
  const topF = d.fundamentals.slice(0, 3).map((f) => `${f.label.toLowerCase()} (${f.share}%)`).join(', ');
  out.push({ tone: 'assinatura', title: 'Do simples para o jogo', text: `Cada aula tem ~${d.progression.avgSteps} etapas de progressão; ${d.progression.endsInGame}% terminam em construção, ataque ou jogo.` });
  out.push({ tone: 'assinatura', title: 'Jogo condicionado ensina', text: `Toda aula fecha com jogo: ${d.rules.slice(0, 2).map(([r, n]) => `${r.toLowerCase()} (${pct(n, d.sessions)}%)`).join(' e ')}.` });
  out.push({ tone: 'assinatura', title: 'Fundamentos que mandam', text: `${topF} das aulas.` });
  out.push({ tone: 'assinatura', title: 'Professor com método', text: `Feedback ${d.methodology.padrao_entrega_professor.feedback.join(' → ').toLowerCase()}; chamar cada aluno pelo nome 4+ vezes; três níveis (aprendiz, intermediário, avançado) com a mesma meta técnica.` });
  if (slug === 'futevolei' && d.weekdays.length) {
    out.push({ tone: 'assinatura', title: 'Uma fase por semana', text: `Aulas de ${d.weekdays.map((w) => w.day.toLowerCase()).join(', ')}: ${Math.round(d.sessions / d.weekdays.length)} semanas, cada uma dedicada a uma fase (recepção, construção, defesa, inteligência de jogo, jogo estruturado). Nas semanas de recepção e construção o tema se repete em dois dias seguidos para consolidar.` });
  }
  const emptyPhases = d.phases.filter((p) => p.count === 0);
  if (emptyPhases.length) out.push({ tone: 'lacuna', title: 'Fase sem aulas', text: `${emptyPhases.map((p) => p.phase).join(', ')} está na metodologia, mas nenhuma aula da base é dessa fase. Alunos aprendizes (D/C) dependem dela.` });
  if (d.missing.length) out.push({ tone: 'lacuna', title: 'Fundamentos sem aula', text: `${d.missing.map(fundamentalLabel).join(', ')} não aparece${d.missing.length > 1 ? 'm' : ''} como tema ou fundamento na base.` });
  const weak = d.fundamentals.filter((f) => f.share < 15);
  if (weak.length) out.push({ tone: 'lacuna', title: 'Pouca repetição', text: `${weak.map((f) => `${f.label} (${f.share}%)`).join(', ')} das aulas.` });
  if (d.withDuration < d.sessions * 0.5) out.push({ tone: 'lacuna', title: 'Tempo por bloco não registrado', text: `Só ${d.withDuration} de ${d.sessions} aulas têm a duração dos blocos. Com o tempo de cada etapa (como na BF-004: 8' + 15' + 12' + 15' + 5' = 55'), o sistema mede volume técnico e monta o plano de aula.` });
  if (slug === 'futevolei') out.push({ tone: 'lacuna', title: 'Sem condicionamento específico', text: 'A base não traz trabalho físico (saltos, deslocamento na areia, força de perna). Um bloco curto de preparação física daria suporte à parte técnica.' });
  return out.map((x) => ({ ...x, text: c(x.text) }));
}
