import { describe, expect, it } from 'vitest';
import { companyChecklist, formatCnpj, isCnpj, validity } from '@/domain/company';

describe('Empresas — regras puras', () => {
  it('CNPJ: dígitos verificadores e formatação', () => {
    expect(isCnpj('11.222.333/0001-81')).toBe(true);
    expect(isCnpj('11222333000181')).toBe(true);
    expect(isCnpj('11.222.333/0001-82')).toBe(false);
    expect(isCnpj('00.000.000/0000-00')).toBe(false);
    expect(isCnpj('123')).toBe(false);
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('validade: vigente, vence em até 30 dias, vencido, sem validade', () => {
    expect(validity(null, '2026-10-08')).toEqual({ state: 'sem_validade', daysLeft: null });
    expect(validity('2026-12-31', '2026-10-08').state).toBe('vigente');
    expect(validity('2026-11-07', '2026-10-08')).toEqual({ state: 'vence_em_breve', daysLeft: 30 });
    expect(validity('2026-10-01', '2026-10-08')).toEqual({ state: 'vencido', daysLeft: -7 });
  });

  it('checklist: essenciais faltando; pior validade manda; arquivado não conta', () => {
    const T = '2026-10-08';
    const c0 = companyChecklist([], T);
    expect(c0.map((c) => [c.kind, c.state])).toEqual([['CONTRATO_SOCIAL', 'faltando'], ['CARTAO_CNPJ', 'faltando'], ['LICENCA_FUNCIONAMENTO', 'faltando'], ['INFORMACOES_BANCARIAS', 'faltando']]);
    const docs = [
      { kind: 'CONTRATO_SOCIAL', validUntil: null },
      { kind: 'LICENCA_FUNCIONAMENTO', validUntil: '2026-10-20' },
      { kind: 'PROCURACAO', validUntil: '2027-05-01' },
      { kind: 'PROCURACAO', validUntil: '2026-09-01' },
      { kind: 'CERTIDAO', validUntil: '2026-09-01', archived: true },
    ];
    const c = Object.fromEntries(companyChecklist(docs, T).map((x) => [x.kind, x.state]));
    expect(c).toMatchObject({ CONTRATO_SOCIAL: 'sem_validade', LICENCA_FUNCIONAMENTO: 'vence_em_breve', PROCURACAO: 'vencido' });
    expect(c.CERTIDAO).toBeUndefined();
  });

  it('informações bancárias: contas digitadas bastam, sem anexo', () => {
    const bank = (n: number) => companyChecklist([], '2026-10-09', n).find((x) => x.kind === 'INFORMACOES_BANCARIAS')!;
    expect(bank(0)).toMatchObject({ state: 'faltando', note: 'cadastre em Dados gerais' });
    expect(bank(2)).toMatchObject({ state: 'sem_validade', note: '2 contas cadastradas' });
  });
});
