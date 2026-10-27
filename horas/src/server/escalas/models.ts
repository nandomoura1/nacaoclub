import { buildRotation } from '@/domain/escalas/rotation';
import type { Bond, HoursMap, Mode, Shift3, WeekCycle, WeekPattern } from '@/domain/escalas/types';

/**
 * Modelos iniciais do documento "Escala de Trabalho 5x2 — Nação Club"
 * (Recepção, Limpeza e Manutenção, Lanchonete e Cozinha). São parâmetros de
 * planejamento: tudo fica editável e precisa ser conferido antes de publicar.
 * A vaga "Novo FUNAP" da Limpeza não entra (sem pessoa contratada).
 */

const h = (hh: number, mm = 0) => hh * 60 + mm;
const s = (a: number, b: number, brk: number): Shift3 => [a, b, brk];
/** seg … dom */
const wk = (...d: (Shift3 | null)[]): WeekPattern => d;
const OFF = null;

export interface ModelMember {
  key: string;
  /** Nome no cadastro (com o setor, para não confundir com homônimos) e apelido na grade. */
  name: string;
  display: string;
  functionName: string;
  altFunctions?: string[];
  bond: Bond;
  mode?: Mode;
  week?: WeekCycle;
  fixedOff?: number[];
  availableDays?: number[];
  autoSchedule?: boolean;
  notes?: string;
}
export interface ModelPost { name: string; kind: 'ABERTURA' | 'FECHAMENTO' | 'ALMOCO' | null; start: number; end: number; weekdays: number[]; min: number; functionName?: string; mandatory?: boolean }
export interface ModelRule { kind: string; params: Record<string, unknown>; mandatory: boolean; label?: string }
export interface SectorModel { name: string; procSector: string | null; hours: HoursMap; notes: string; members: ModelMember[]; posts: ModelPost[]; rules: ModelRule[] }

const WEEK = [1, 2, 3, 4, 5];

// ─── Recepção ─────────────────────────────────────────────────
const R = { m1: s(h(5), h(13), 60), m2: s(h(6), h(14), 60), m3: s(h(7), h(15), 60), t1: s(h(13), h(21), 60), t2: s(h(14), h(22), 60) };
/**
 * Recepção: 6 posições (a grade do documento) em rodízio semanal. P1–P3 trabalham
 * qui e sex e folgam o fim de semana; P4–P5 folgam sexta e trabalham sábado; P6
 * folga quinta e trabalha domingo. Cada semana todos avançam uma posição.
 */
export const RECEPCAO_POSITIONS: WeekPattern[] = [
  wk(R.m1, R.m1, R.m1, R.m1, s(h(5), h(14), 60), OFF, OFF),
  wk(R.m2, R.m2, R.m2, R.m2, s(h(6), h(15), 60), OFF, OFF),
  wk(R.m3, R.m3, R.m3, R.m3, s(h(13), h(22), 60), OFF, OFF),
  wk(R.t1, R.t1, R.t1, R.t1, OFF, s(h(7), h(16), 60), OFF),
  wk(R.t2, R.t2, R.t2, R.t2, OFF, s(h(8), h(17), 60), OFF),
  wk(R.t2, R.t2, R.t2, OFF, s(h(13), h(22), 60), OFF, s(h(8), h(14), 15)),
];
const RECEPCAO_ORDER: [string, string][] = [['duda', 'Duda'], ['lawana', 'Lawana'], ['brenda', 'Brenda'], ['manu', 'Manu'], ['debora', 'Débora'], ['igor', 'Igor']];
const RECEPCAO_CYCLES = buildRotation(RECEPCAO_POSITIONS);

const recepcao: SectorModel = {
  name: 'Recepção',
  procSector: 'Recepção e Comercial',
  hours: { 1: [[h(5), h(22)]], 2: [[h(5), h(22)]], 3: [[h(5), h(22)]], 4: [[h(5), h(22)]], 5: [[h(5), h(22)]], 6: [[h(7), h(17)]], 7: [[h(8), h(14)]] },
  notes: 'Modelo do documento (análise de 21/10/2026) com rodízio semanal das 6 posições: todos passam por sábado e domingo. Pendências do documento: horários de almoço e compatibilidade com contratos/CCT.',
  members: RECEPCAO_ORDER.map(([key, display], i) => ({
    key, name: `${display} (Recepção)`, display, functionName: 'Recepção', bond: 'CLT' as const,
    week: { A: RECEPCAO_CYCLES[i]![0]!, cycle: RECEPCAO_CYCLES[i] },
    ...(i === 0 ? { notes: 'Rodízio de 6 posições: quem folga na quinta trabalha domingo; quem folga na sexta trabalha sábado; quem trabalha quinta e sexta folga sábado e domingo.' } : {}),
  })),
  posts: [
    { name: 'Abertura', kind: 'ABERTURA', start: h(5), end: h(6), weekdays: WEEK, min: 1 },
    { name: 'Fechamento', kind: 'FECHAMENTO', start: h(21), end: h(22), weekdays: WEEK, min: 1 },
    { name: 'Abertura sábado', kind: 'ABERTURA', start: h(7), end: h(8), weekdays: [6], min: 1 },
    { name: 'Fechamento sábado', kind: 'FECHAMENTO', start: h(16), end: h(17), weekdays: [6], min: 1 },
    { name: 'Abertura domingo', kind: 'ABERTURA', start: h(8), end: h(9), weekdays: [7], min: 1 },
    { name: 'Fechamento domingo', kind: 'FECHAMENTO', start: h(13), end: h(14), weekdays: [7], min: 1 },
  ],
  rules: [],
};

// ─── Limpeza e Manutenção ─────────────────────────────────────
const L = { m: s(h(6, 30), h(16, 30), 120), n: s(h(13), h(22), 60), sab: s(h(8), h(17), 60) };
const limpeza: SectorModel = {
  name: 'Limpeza e Manutenção',
  procSector: 'Manutenção e Infraestrutura',
  hours: { 1: [[h(6, 30), h(22)]], 2: [[h(6, 30), h(22)]], 3: [[h(6, 30), h(22)]], 4: [[h(6, 30), h(22)]], 5: [[h(6, 30), h(22)]], 6: [[h(7), h(17)]], 7: [[h(8), h(17, 30)]] },
  notes: 'Modelo do documento (versão revisada). John: líder CLT sem grade. Vaga "Novo FUNAP" (seg–sex 10h–20h e sáb 08h–17h) ainda sem pessoa: cadastre quando contratar. Jornadas FUNAP como informadas, sem validação contratual.',
  members: [
    { key: 'marcos', name: 'Marcos (Limpeza)', display: 'Marcos', functionName: 'Limpeza geral', bond: 'CLT', fixedOff: [5, 7], week: { A: wk(L.m, L.m, L.m, L.m, OFF, L.sab, OFF) } },
    { key: 'junior', name: 'Junior (Limpeza)', display: 'Junior', functionName: 'Limpeza', bond: 'CLT', week: { A: wk(L.n, L.n, L.n, L.n, L.n, OFF, OFF), B: wk(L.n, L.n, L.n, L.n, OFF, L.sab, OFF) } },
    { key: 'lu', name: 'Lu (Limpeza)', display: 'Lu', functionName: 'Limpeza', bond: 'CLT', week: { A: wk(L.m, L.m, L.m, L.m, OFF, L.sab, OFF), B: wk(L.m, L.m, L.m, L.m, L.m, OFF, OFF) } },
    { key: 'kelly', name: 'Kelly (Limpeza)', display: 'Kelly', functionName: 'Limpeza', bond: 'CLT', week: { A: wk(L.m, L.m, L.m, L.m, L.m, OFF, OFF), B: wk(L.m, L.m, L.m, L.m, OFF, L.sab, OFF) } },
    { key: 'fernando', name: 'Fernando (Manutenção)', display: 'Fernando', functionName: 'Quadras de areia', altFunctions: ['Limpeza geral'], bond: 'CLT', fixedOff: [6, 7], week: { A: wk(L.m, L.m, L.m, L.m, L.m, OFF, OFF) }, notes: 'Sexta: 06h30–12h limpeza geral matutina (cobre o Marcos), 12h–14h almoço, 14h–16h30 quadras de areia.' },
    { key: 'carlos', name: 'Carlos (Limpeza)', display: 'Carlos', functionName: 'Limpeza', bond: 'CLT', week: { A: wk(L.n, L.n, L.n, L.n, OFF, L.sab, OFF), B: wk(L.n, L.n, L.n, L.n, L.n, OFF, OFF) }, notes: 'No sábado: prioridade Kids, Funcional, CrossFit e áreas próximas.' },
    { key: 'john', name: 'John (Limpeza)', display: 'John', functionName: 'Líder', bond: 'CLT', autoSchedule: false, notes: 'Líder CLT sem grade horária neste planejamento (orientação da gestão).' },
    { key: 'eduardo', name: 'Eduardo (Limpeza FUNAP)', display: 'Eduardo', functionName: 'Limpeza', bond: 'FUNAP', week: { A: wk(L.m, L.m, L.m, L.m, L.m, s(h(7), h(17), 60), OFF) }, notes: 'Jornada informada; intervalos a confirmar com a FUNAP.' },
    { key: 'gustavo', name: 'Gustavo (Limpeza FUNAP)', display: 'Gustavo', functionName: 'Limpeza', bond: 'FUNAP', week: { A: wk(L.n, L.n, L.n, L.n, L.n, OFF, s(h(8), h(17), 60)) }, notes: 'Jornada informada; intervalos a confirmar com a FUNAP.' },
    { key: 'eurivan', name: 'Eurivan (Limpeza FUNAP)', display: 'Eurivan', functionName: 'Limpeza', bond: 'FUNAP', week: { A: wk(s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), OFF, s(h(8), h(17), 60)) }, notes: 'Jornada informada; intervalos a confirmar com a FUNAP.' },
    { key: 'leandro', name: 'Leandro (Limpeza FUNAP)', display: 'Leandro', functionName: 'Limpeza', bond: 'FUNAP', week: { A: wk(L.n, L.n, L.n, L.n, L.n, OFF, s(h(8), h(17), 60)) }, notes: 'Jornada informada; intervalos a confirmar com a FUNAP.' },
    { key: 'ezimar', name: 'Ezimar (Limpeza FUNAP)', display: 'Ezimar', functionName: 'Limpeza', bond: 'FUNAP', week: { A: wk(s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), s(h(7), h(16), 60), OFF, s(h(8), h(17, 30), 60)) }, notes: 'Jornada informada; intervalos a confirmar com a FUNAP.' },
  ],
  posts: [
    { name: 'Limpeza geral matutina', kind: 'ABERTURA', start: h(6, 30), end: h(12), weekdays: WEEK, min: 1, functionName: 'Limpeza geral' },
    { name: 'Fechamento', kind: 'FECHAMENTO', start: h(21), end: h(22), weekdays: WEEK, min: 1 },
    { name: 'Equipe de sábado', kind: null, start: h(8), end: h(17), weekdays: [6], min: 3, mandatory: false },
  ],
  rules: [
    { kind: 'TRABALHA_SEMPRE', params: { memberId: '@marcos', weekdays: [6] }, mandatory: true },
    { kind: 'ALTERNAR_FIM_DE_SEMANA', params: { groupA: ['@carlos', '@lu'], groupB: ['@junior', '@kelly'], weekdays: [6], compensate: false }, mandatory: true, label: 'Junior × Carlos e Lu × Kelly alternam os sábados (semana A: Carlos e Lu)' },
  ],
};

// ─── Lanchonete ───────────────────────────────────────────────
const C = { jm: s(h(7), h(16), 60), dt: s(h(13), h(22), 60), sab: s(h(8), h(17), 60), fv: s(h(14), h(22), 60) };
const lanchonete: SectorModel = {
  name: 'Lanchonete',
  procSector: 'Lanchonete',
  hours: { 1: [[h(7), h(22)]], 2: [[h(7), h(22)]], 3: [[h(7), h(22)]], 4: [[h(7), h(22)]], 5: [[h(7), h(22)]], 6: [[h(8), h(17)]], 7: [[h(8), h(17)]] },
  notes: 'Modelo do documento (revisado). Caio é gerente contratado como MEI: os horários dele são janelas de cobertura (sem 5x2 nem regras CLT). DP/jurídico devem validar a atuação MEI com horários fixos.',
  members: [
    { key: 'caio', name: 'Caio (Lanchonete)', display: 'Caio', functionName: 'Gerente', altFunctions: ['Atendimento'], bond: 'MEI', week: { A: wk(OFF, s(h(7), h(15), 0), s(h(12), h(22), 0), s(h(12), h(22), 0), s(h(9), h(14), 0), s(h(8), h(17), 0), s(h(8), h(15), 0)), B: wk(OFF, s(h(14), h(22), 0), s(h(7), h(15), 0), s(h(14), h(22), 0), s(h(9), h(14), 0), s(h(8), h(17), 0), s(h(8), h(15), 0)) }, notes: 'Sexta: apoio gerencial a partir das 9h.' },
    { key: 'jess', name: 'Jess (Lanchonete)', display: 'Jess', functionName: 'Atendimento', bond: 'CLT', fixedOff: [7], week: { A: wk(C.jm, OFF, C.jm, C.jm, C.jm, C.sab, OFF), B: wk(C.jm, C.jm, OFF, C.jm, C.jm, C.sab, OFF) } },
    { key: 'debora', name: 'Débora (Lanchonete)', display: 'Débora', functionName: 'Atendimento', bond: 'CLT', fixedOff: [7], week: { A: wk(C.dt, C.dt, OFF, C.dt, C.dt, C.sab, OFF), B: wk(C.dt, OFF, C.dt, C.dt, C.dt, C.sab, OFF) } },
    { key: 'felipe', name: 'Felipe (Lanchonete FUNAP)', display: 'Felipe', functionName: 'Atendimento', bond: 'FUNAP', week: { A: wk(C.fv, C.fv, C.fv, C.fv, C.fv, OFF, s(h(8), h(17), 60)) }, notes: '43h informadas; sábado sem atividade programada.' },
  ],
  posts: [
    { name: 'Abertura', kind: 'ABERTURA', start: h(7), end: h(8), weekdays: WEEK, min: 1 },
    { name: 'Fechamento', kind: 'FECHAMENTO', start: h(21), end: h(22), weekdays: WEEK, min: 1 },
    { name: 'Abertura fim de semana', kind: 'ABERTURA', start: h(8), end: h(9), weekdays: [6, 7], min: 1 },
    { name: 'Fechamento fim de semana', kind: 'FECHAMENTO', start: h(16), end: h(17), weekdays: [6, 7], min: 1 },
  ],
  rules: [
    { kind: 'ALTERNAR_FOLGA', params: { memberA: '@jess', memberB: '@debora', weekdays: [2, 3] }, mandatory: true },
    { kind: 'COBRE_FOLGA', params: { coverId: '@caio', coveredId: '@jess', startMin: h(7), endMin: h(15) }, mandatory: true, label: 'Caio cobre a abertura (07–15) quando a Jess folga' },
    { kind: 'TRABALHA_SEMPRE', params: { memberId: '@caio', weekdays: [5] }, mandatory: false, label: 'Caio dá apoio gerencial às sextas' },
  ],
};

// ─── Cozinha ──────────────────────────────────────────────────
const K = { m: s(h(7), h(16), 60), t: s(h(13), h(22), 60), sab: s(h(8), h(17), 60), dom: s(h(8), h(14), 60) };
const cozinha: SectorModel = {
  name: 'Cozinha',
  procSector: null,
  hours: { 1: [[h(7), h(22)]], 2: [[h(7), h(22)]], 3: [[h(7), h(22)]], 4: [[h(7), h(22)]], 5: [[h(7), h(22)]], 6: [[h(8), h(17)]], 7: [[h(8), h(14)]] },
  notes: 'Modelo do documento (nova escala 5x2). Equipe 1 = Caliane e Tati; Equipe 2 = Renata e Tati Amorim. DP: validar 37h nas semanas com domingo e a jornada FUNAP (Eliel somaria 48h).',
  members: [
    { key: 'fia', name: 'Fia (Cozinha)', display: 'Fia', functionName: 'Cozinheira', altFunctions: ['Almoço'], bond: 'CLT', fixedOff: [2, 7], week: { A: wk(K.m, OFF, K.m, K.m, K.m, K.sab, OFF) }, notes: 'Responsável pela produção do almoço quando escalada.' },
    { key: 'caliane', name: 'Caliane (Cozinha)', display: 'Caliane', functionName: 'Cozinheira', bond: 'CLT', fixedOff: [3], week: { A: wk(K.m, K.m, OFF, K.m, K.m, K.sab, OFF), B: wk(K.m, K.m, OFF, K.m, K.m, OFF, K.dom) }, notes: 'Equipe 1 — matutino.' },
    { key: 'tati', name: 'Tati (Cozinha)', display: 'Tati', functionName: 'Cozinheira', bond: 'CLT', fixedOff: [4], week: { A: wk(K.m, K.m, K.m, OFF, K.m, K.sab, OFF), B: wk(K.m, K.m, K.m, OFF, K.m, OFF, K.dom) }, notes: 'Equipe 1 — matutino.' },
    { key: 'renata', name: 'Renata (Cozinha)', display: 'Renata', functionName: 'Cozinheira', bond: 'CLT', fixedOff: [1], week: { A: wk(OFF, K.t, K.t, K.t, K.t, OFF, K.dom), B: wk(OFF, K.t, K.t, K.t, K.t, K.sab, OFF) }, notes: 'Equipe 2 — vespertino.' },
    { key: 'tamorim', name: 'Tati Amorim (Cozinha)', display: 'Tati Amorim', functionName: 'Cozinheira', bond: 'CLT', fixedOff: [5], week: { A: wk(K.t, K.t, K.t, K.t, OFF, OFF, K.dom), B: wk(K.t, K.t, K.t, K.t, OFF, K.sab, OFF) }, notes: 'Equipe 2 — vespertino.' },
    { key: 'eliel', name: 'Eliel (Cozinha FUNAP)', display: 'Eliel', functionName: 'Auxiliar', bond: 'FUNAP', week: { A: wk(K.m, K.m, K.m, K.m, K.m, K.sab, OFF) }, notes: 'Documento: validar a jornada (somaria 48h semanais).' },
    { key: 'george', name: 'George (Cozinha FUNAP)', display: 'George', functionName: 'Auxiliar', bond: 'FUNAP', week: { A: wk(s(h(14), h(22), 60), s(h(14), h(22), 60), s(h(14), h(22), 60), s(h(14), h(22), 60), s(h(14), h(22), 60), K.sab, OFF) } },
    { key: 'edilene', name: 'Edilene (Cozinha freelancer)', display: 'Edilene', functionName: 'Almoço', bond: 'FREELANCER', mode: 'COBERTURA', availableDays: [2], notes: 'Cobre a produção do almoço de terça (de preferência 09h–14h), conforme necessidade.' },
    { key: 'celia', name: 'Célia (Cozinha freelancer)', display: 'Célia', functionName: 'Cozinheira', altFunctions: ['Almoço'], bond: 'FREELANCER', mode: 'COBERTURA', availableDays: [6], notes: 'Reforço opcional nos sábados de maior movimento.' },
  ],
  posts: [
    { name: 'Produção do almoço', kind: 'ALMOCO', start: h(9), end: h(14), weekdays: [1, 2, 3, 4, 5, 6], min: 1, functionName: 'Almoço' },
    { name: 'Abertura', kind: 'ABERTURA', start: h(7), end: h(8), weekdays: WEEK, min: 1 },
    { name: 'Fechamento', kind: 'FECHAMENTO', start: h(21), end: h(22), weekdays: WEEK, min: 1 },
    { name: 'Abertura fim de semana', kind: 'ABERTURA', start: h(8), end: h(9), weekdays: [6, 7], min: 1 },
    { name: 'Fechamento sábado', kind: 'FECHAMENTO', start: h(16), end: h(17), weekdays: [6], min: 1 },
    { name: 'Fechamento domingo', kind: 'FECHAMENTO', start: h(13), end: h(14), weekdays: [7], min: 1 },
  ],
  rules: [
    { kind: 'TRABALHA_SEMPRE', params: { memberId: '@fia', weekdays: [1, 3, 4, 5, 6] }, mandatory: true, label: 'Fia trabalha seg, qua, qui, sex e sáb (responsável pelo almoço)' },
    { kind: 'ALTERNAR_FIM_DE_SEMANA', params: { groupA: ['@caliane', '@tati'], groupB: ['@renata', '@tamorim'], weekdays: [6], compensate: false }, mandatory: true, label: 'Sábado: Equipe 1 na semana A, Equipe 2 na semana B' },
    { kind: 'ALTERNAR_FIM_DE_SEMANA', params: { groupA: ['@renata', '@tamorim'], groupB: ['@caliane', '@tati'], weekdays: [7], compensate: false }, mandatory: true, label: 'Domingo: Equipe 2 na semana A, Equipe 1 na semana B' },
    { kind: 'EVITAR_FOLGA_JUNTA', params: { memberIds: ['@fia', '@caliane', '@tati', '@renata', '@tamorim'], weekdays: WEEK }, mandatory: false, label: 'Evitar duas CLT da cozinha de folga no mesmo dia útil' },
  ],
};

export const DOCUMENT_MODELS: SectorModel[] = [recepcao, limpeza, lanchonete, cozinha];
/** Semana "A" de referência dos ciclos (editável em Pré-requisitos). */
export const MODEL_CYCLE_REF = '2026-11-02';
