import { describe, expect, it } from 'vitest';
import { checkTemplate, companyLiterals, contractBlocks, renderContract, replaceCompanyLiterals } from '@/domain/contracts';

const companies = [
  { legalName: 'Nacao Club Recreacoes Esportivas Ltda', tradeName: 'Nação Club', cnpj: '11222333000181' },
  { legalName: 'NACAO CROSSFIT CENTRO ESPORTIVO LTDA', tradeName: 'Nação Crossfit', cnpj: '11444777000161' },
];

describe('texto do contrato: tabela, separador e itálico', () => {
  it('tabela markdown vira linhas e células (cabeçalho + valores), "---" vira separador', () => {
    const b = contractBlocks('## Pagamento\n\n| Descrição | Valor |\n|---|---|\n| Valor bruto | R$ 100 |\n| **Líquido** | **R$ 90** |\n\n---\n\n*Documento emitido pelo sistema.*');
    expect(b.map((x) => x.kind)).toEqual(['h2', 'table', 'hr', 'p']);
    const t = b[1] as Extract<(typeof b)[number], { kind: 'table' }>;
    expect(t.rows.map((r) => r.map((c) => c.map((x) => x.text).join('')))).toEqual([['Descrição', 'Valor'], ['Valor bruto', 'R$ 100'], ['Líquido', 'R$ 90']]);
    expect(t.rows[2]![0]![0]!.bold).toBe(true);
    expect(b[3]!.runs.map((r) => r.text).join('')).toBe('Documento emitido pelo sistema.');
  });
});

describe('dados de empresa escritos à mão no modelo', () => {
  const body = '**CONTRATANTE:** NAÇÃO CLUB RECREAÇÕES ESPORTIVAS LTDA, CNPJ nº 11.222.333/0001-81. Quitação à Nação Club Recreações Esportivas Ltda. CNPJ: 11222333000181';
  it('acha nome (sem acento/maiúscula) e CNPJ, e troca pelas variáveis', () => {
    expect(companyLiterals(body, companies)).toEqual(['Nacao Club Recreacoes Esportivas Ltda', 'CNPJ 11.222.333/0001-81']);
    const fixed = replaceCompanyLiterals(body, companies);
    expect(fixed).toBe('**CONTRATANTE:** {{empresa_razao_social}}, CNPJ nº {{empresa_cnpj}}. Quitação à {{empresa_razao_social}}. CNPJ: {{empresa_cnpj}}');
    expect(companyLiterals(fixed, companies)).toEqual([]);
    // Com a variável, o texto muda conforme a empresa escolhida.
    const r = renderContract(fixed, [], {}, { empresa_razao_social: 'NACAO CROSSFIT CENTRO ESPORTIVO LTDA', empresa_cnpj: '11.444.777/0001-61' });
    expect(r.text).toContain('CONTRATANTE:** NACAO CROSSFIT CENTRO ESPORTIVO LTDA, CNPJ nº 11.444.777/0001-61');
  });
  it('valor escrito dentro de {{ }} é recusado (o valor vai em cada contrato)', () => {
    expect(checkTemplate('Pago a {{Fulano de Tal}} — {{nome}}', [{ key: 'nome', label: 'Nome', type: 'texto', required: true }])[0]).toMatch(/não o valor: \{\{Fulano de Tal\}\}/);
  });
});

describe('R$ antes de campo do tipo Valor', () => {
  it('avisa (o campo já escreve R$ e o valor por extenso)', () => {
    const f = [{ key: 'valor_cobertura', label: 'Cobertura', type: 'moeda' as const, required: true }];
    expect(checkTemplate('Cobertura: R$ {{valor_cobertura}}', f).join()).toMatch(/Tire o "R\$" antes de \{\{valor_cobertura\}\}/);
    expect(checkTemplate('Cobertura: {{valor_cobertura}}', f)).toEqual([]);
    expect(renderContract('Cobertura: {{valor_cobertura}}', f, { valor_cobertura: '10.000' }, {}).text).toBe('Cobertura: R$ 10.000,00 (dez mil reais)');
  });
});

describe('valor em reais digitado no padrão brasileiro', () => {
  it('ponto é milhar; vírgula é centavo', async () => {
    const { parseMoney } = await import('@/domain/contracts');
    expect(parseMoney('10.000')).toBe(1_000_000);
    expect(parseMoney('1.500')).toBe(150_000);
    expect(parseMoney('1.234.567')).toBe(123_456_700);
    expect(parseMoney('1.500,50')).toBe(150_050);
    expect(parseMoney('R$ 800')).toBe(80_000);
    expect(parseMoney('1500.5')).toBe(150_050);
    expect(parseMoney('99.90')).toBe(9_990);
  });
});
