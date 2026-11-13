import { describe, expect, it } from 'vitest';
import { adjustPrice, changePct, parseMoney, roundPrice, tableTsv, totalOf } from '@/domain/planos';
import sheet from '@/server/planos/planilha-2026.json';

describe('Planos Nação: regras puras', () => {
  it('total = mensal × meses; sem meses = valor único', () => {
    expect(totalOf(299.25, 6)).toBe(1795.5);
    expect(totalOf(550, null)).toBe(550);
    expect(totalOf(null, 12)).toBeNull();
  });

  it('variação percentual sobre a tabela-base', () => {
    expect(changePct(438.9, 399)).toBe(10);
    expect(changePct(299, 299.25)).toBe(-0.1);
    expect(changePct(100, null)).toBeNull();
    expect(changePct(100, 0)).toBeNull();
  });

  it('arredondamentos comerciais', () => {
    expect(roundPrice(438.94, 'CENTAVOS')).toBe(438.94);
    expect(roundPrice(438.94, 'INTEIRO')).toBe(439);
    expect(roundPrice(438.94, 'NOVENTA')).toBe(438.9);
    expect(roundPrice(441.2, 'NOVENTA')).toBe(440.9);
    expect(roundPrice(441.2, 'NOVE')).toBe(449);
    expect(roundPrice(439, 'NOVE')).toBe(439);
    expect(adjustPrice(399, 10, 'NOVENTA')).toBe(438.9); // o repasse de nov/2026
    expect(adjustPrice(399, -5, 'INTEIRO')).toBe(379);
  });

  it('valores digitados em reais', () => {
    expect(parseMoney('438,90')).toBe(438.9);
    expect(parseMoney('R$ 1.234,5')).toBe(1234.5);
    expect(parseMoney('438.9')).toBe(438.9);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBe('invalid');
    expect(parseMoney('-3')).toBe('invalid');
  });

  it('copiar para planilha: TSV com uma linha por opção e totais', () => {
    const tsv = tableTsv([{ group: 'Nação Fit', name: 'Nação Fit', status: 'MANTEM', modalities: 'Academia', commonClasses: null, specificClasses: null, checkin: 'Ilimitado', note: null,
      options: [{ label: 'Mensal', months: 1, card: 438.9, recurring: null }, { label: 'Semestral', months: 6, card: 299, recurring: 328.9 }] }], { withStatus: true });
    const lines = tsv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^GRUPO\tPLANOS/);
    expect(lines[1]!.split('\t').slice(0, 2)).toEqual(['Nação Fit', 'Nação Fit']);
    expect(lines[2]!.split('\t').slice(6, 12)).toEqual(['Semestral', '6', '299,00', '1794,00', '328,90', '1973,40']);
    expect(lines[1]!.split('\t').at(-2)).toBe('Mantém');
  });

  it('dados da planilha: todo plano do repasse existe em 2026 e os nomes não se repetem', () => {
    const names = sheet.plans2026.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(sheet.repasse.every((p) => names.includes(p.name))).toBe(true);
    expect(sheet.plans2026).toHaveLength(30);
    expect(sheet.repasse).toHaveLength(20);
  });
});
