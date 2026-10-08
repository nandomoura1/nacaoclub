import { addDays, toUtc } from '@/domain/dates';

const diffDays = (from: string, to: string) => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);

/**
 * Documentos da equipe (Gestão de Horas): o que cada funcionário precisa ter
 * na pasta e o contador do contrato de estágio. Puro.
 *
 * Estágio (Lei 11.788/2008): o contrato é o termo de compromisso (+ aditivos)
 * com início e fim; estagiário com contrato vencido não pode trabalhar; a
 * duração na mesma empresa não passa de 2 anos (exceto estagiário com
 * deficiência — o sistema só avisa).
 */

export type StaffDocKind = 'IDENTIDADE' | 'CREF' | 'CONTRATO_TRABALHO' | 'CONTRATO_ESTAGIO' | 'OUTRO';

export const STAFF_DOC_KINDS: { id: StaffDocKind; label: string; hint: string; dates: 'none' | 'until' | 'range' | 'range-required'; number?: string }[] = [
  { id: 'IDENTIDADE', label: 'Identidade', hint: 'RG ou CNH (frente e verso)', dates: 'none', number: 'Nº do documento' },
  { id: 'CREF', label: 'CREF', hint: 'Carteira do CREF', dates: 'until', number: 'Nº do registro' },
  { id: 'CONTRATO_TRABALHO', label: 'Contrato de trabalho', hint: 'CLT, PJ/MEI ou prestação de serviço', dates: 'range' },
  { id: 'CONTRATO_ESTAGIO', label: 'Contrato de estágio', hint: 'Termo de compromisso ou aditivo, com início e fim', dates: 'range-required' },
  { id: 'OUTRO', label: 'Outros documentos', hint: 'Comprovantes, certificados, atestados…', dates: 'none' },
];
export const staffDocLabel = (k: string) => STAFF_DOC_KINDS.find((d) => d.id === k)?.label ?? k;

/** Avisa com esta antecedência que o contrato do estagiário vai vencer. */
export const INTERN_WARN_DAYS = 30;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Estagiário: vínculo "Estágio" (ou cargo "Estagiário"). */
export const isIntern = (contractType: string | null | undefined, position: string | null | undefined) =>
  /estag/.test(fold(contractType ?? '')) || /estag/.test(fold(position ?? ''));

export interface DatedDoc { kind: string; validFrom: string | null; validUntil: string | null }

export type InternState = 'sem_contrato' | 'nao_iniciado' | 'vigente' | 'vence_em_breve' | 'vencido';
export interface InternStatus {
  state: InternState;
  /** Dias até o fim (negativo = dias de atraso). */
  daysLeft: number | null;
  start: string | null;
  end: string | null;
  /** Do primeiro início ao último fim passa de 2 anos. */
  over2Years: boolean;
}

const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;

/** Contador do estágio: vale o contrato que cobre hoje; sem ele, o de fim mais recente. */
export function internshipStatus(docs: DatedDoc[], today: string): InternStatus {
  const contracts = docs.filter((d) => d.kind === 'CONTRATO_ESTAGIO' && d.validUntil);
  if (!contracts.length) return { state: 'sem_contrato', daysLeft: null, start: null, end: null, over2Years: false };
  const covering = contracts.filter((c) => (!c.validFrom || c.validFrom <= today) && c.validUntil! >= today);
  // Aditivos: entre os que cobrem hoje, o de fim mais distante.
  const pick = (covering.length ? covering : contracts).reduce((a, b) => (b.validUntil! > a.validUntil! ? b : a));
  const end = pick.validUntil!;
  const daysLeft = diffDays(today, end);
  const starts = contracts.map((c) => c.validFrom).filter((x): x is string => !!x).sort();
  const lastEnd = contracts.map((c) => c.validUntil!).sort().at(-1)!;
  const over2Years = !!starts[0] && lastEnd > addDays(addYears(starts[0], 2), -1);
  let state: InternState;
  if (end < today) state = 'vencido';
  else if (!covering.length && pick.validFrom && pick.validFrom > today) state = 'nao_iniciado';
  else if (daysLeft <= INTERN_WARN_DAYS) state = 'vence_em_breve';
  else state = 'vigente';
  return { state, daysLeft, start: pick.validFrom, end, over2Years };
}

export type ChecklistState = 'ok' | 'faltando' | 'vencido' | 'opcional';
export interface ChecklistItem { kind: StaffDocKind; label: string; state: ChecklistState; until: string | null }

/** O que a pasta precisa ter: identidade; CREF (estagiário: opcional); contrato de trabalho ou de estágio. */
export function docChecklist(intern: boolean, docs: DatedDoc[], today: string): ChecklistItem[] {
  const need: { kind: StaffDocKind; required: boolean }[] = [
    { kind: 'IDENTIDADE', required: true },
    { kind: 'CREF', required: !intern },
    { kind: intern ? 'CONTRATO_ESTAGIO' : 'CONTRATO_TRABALHO', required: true },
  ];
  return need.map(({ kind, required }) => {
    const mine = docs.filter((d) => d.kind === kind);
    const label = staffDocLabel(kind);
    if (!mine.length) return { kind, label, state: required ? 'faltando' : 'opcional', until: null };
    const dated = mine.filter((d) => d.validUntil);
    // Sem validade informada vale como presente; com validade, vale a mais longa.
    if (dated.length < mine.length || !dated.length) return { kind, label, state: 'ok', until: null };
    const until = dated.map((d) => d.validUntil!).sort().at(-1)!;
    return { kind, label, state: until < today ? 'vencido' : 'ok', until };
  });
}
