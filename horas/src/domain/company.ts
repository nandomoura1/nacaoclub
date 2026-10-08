import { toUtc } from '@/domain/dates';

/**
 * Empresas do grupo (Administração): validação de CNPJ, tipos de documento
 * essenciais e situação de validade (licenças, procurações, certidões). Puro.
 */

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** CNPJ válido (dígitos verificadores). */
export function isCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const formatCnpj = (value: string) => {
  const d = onlyDigits(value);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : value;
};

export type CompanyDocKind =
  | 'CONTRATO_SOCIAL' | 'ALTERACAO_CONTRATUAL' | 'CARTAO_CNPJ' | 'LICENCA_FUNCIONAMENTO' | 'ALVARA_BOMBEIROS'
  | 'PROCURACAO' | 'CERTIDAO' | 'INFORMACOES_BANCARIAS' | 'CONTRATO' | 'OUTRO';

/** `expires`: costuma ter validade — o sistema pede a data e avisa antes de vencer. */
export const COMPANY_DOC_KINDS: { id: CompanyDocKind; label: string; hint: string; expires: boolean; essential: boolean }[] = [
  { id: 'CONTRATO_SOCIAL', label: 'Contrato social', hint: 'Contrato social consolidado', expires: false, essential: true },
  { id: 'ALTERACAO_CONTRATUAL', label: 'Alteração contratual', hint: 'Aditivos e alterações do contrato social', expires: false, essential: false },
  { id: 'CARTAO_CNPJ', label: 'Cartão CNPJ', hint: 'Comprovante de inscrição na Receita', expires: false, essential: true },
  { id: 'LICENCA_FUNCIONAMENTO', label: 'Licença de funcionamento', hint: 'Alvará / licença da Administração Regional', expires: true, essential: true },
  { id: 'ALVARA_BOMBEIROS', label: 'Bombeiros (licença/vistoria)', hint: 'Licença ou vistoria do Corpo de Bombeiros', expires: true, essential: false },
  { id: 'PROCURACAO', label: 'Procuração', hint: 'Procurações vigentes (contador, banco, representantes)', expires: true, essential: false },
  { id: 'CERTIDAO', label: 'Certidão', hint: 'CND federal, estadual, municipal, FGTS, trabalhista…', expires: true, essential: false },
  { id: 'INFORMACOES_BANCARIAS', label: 'Informações bancárias', hint: 'Comprovante de conta, cartão de assinaturas', expires: false, essential: true },
  { id: 'CONTRATO', label: 'Contrato com terceiros', hint: 'Aluguel, parcerias, fornecedores', expires: true, essential: false },
  { id: 'OUTRO', label: 'Outros', hint: 'Qualquer outro documento da empresa', expires: false, essential: false },
];
export const companyDocLabel = (k: string) => COMPANY_DOC_KINDS.find((d) => d.id === k)?.label ?? k;

/** Avisa com esta antecedência que um documento vai vencer. */
export const COMPANY_WARN_DAYS = 30;

export type ValidityState = 'sem_validade' | 'vigente' | 'vence_em_breve' | 'vencido';
export function validity(validUntil: string | null, today: string): { state: ValidityState; daysLeft: number | null } {
  if (!validUntil) return { state: 'sem_validade', daysLeft: null };
  const daysLeft = Math.round((toUtc(validUntil).getTime() - toUtc(today).getTime()) / 86_400_000);
  return { state: daysLeft < 0 ? 'vencido' : daysLeft <= COMPANY_WARN_DAYS ? 'vence_em_breve' : 'vigente', daysLeft };
}

/**
 * Situação de cada tipo na pasta: falta (essencial sem arquivo), ok, ou a
 * validade do documento mais recente daquele tipo. Vários do mesmo tipo
 * (ex.: procurações) valem cada um — o pior estado manda no resumo.
 */
export function companyChecklist(all: { kind: string; validUntil: string | null; archived?: boolean }[], today: string) {
  // Arquivado (substituído por um mais novo) não conta para alerta nem para "na pasta".
  const docs = all.filter((d) => !d.archived);
  return COMPANY_DOC_KINDS.filter((k) => k.essential || docs.some((d) => d.kind === k.id)).map((k) => {
    const mine = docs.filter((d) => d.kind === k.id);
    if (!mine.length) return { kind: k.id, label: k.label, state: 'faltando' as const, daysLeft: null };
    const states = mine.map((d) => validity(d.validUntil, today));
    const order: ValidityState[] = ['vencido', 'vence_em_breve', 'vigente', 'sem_validade'];
    const worst = states.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))[0]!;
    return { kind: k.id, label: k.label, state: worst.state, daysLeft: worst.daysLeft };
  });
}
