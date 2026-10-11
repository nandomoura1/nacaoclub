import { describe, expect, it } from 'vitest';
import { defaultStatus, dupKey, nextYearSameWeekday, planScheduleImport, type ScheduleItem } from '@/domain/marketing/schedule-import';

const I = (data: string, titulo: string, tipo: ScheduleItem['tipo'], extra: Partial<ScheduleItem> = {}): ScheduleItem =>
  ({ data, dataFim: null, titulo, tipo, detalhes: null, parceiro: null, aConfirmar: false, campanhaTipo: null, origem: 'teste', ...extra });

describe('importação de cronograma (puro)', () => {
  const today = '2026-10-14';

  it('destino e status padrão: passado realizado/finalizado, futuro a confirmar = planejado/ideia', () => {
    expect(defaultStatus('evento', '2026-09-12', today, false)).toBe('REALIZADO');
    expect(defaultStatus('evento', '2026-12-19', today, true)).toBe('PLANEJADO');
    expect(defaultStatus('evento', '2026-11-07', today, false)).toBe('CONFIRMADO');
    expect(defaultStatus('campanha', '2026-08-01', today, false)).toBe('FINALIZADA');
    expect(defaultStatus('campanha', '2026-08-01', today, true)).toBe('IDEIA');
    expect(defaultStatus('campanha', '2026-11-01', today, false)).toBe('IDEIA');
  });

  it('feriado e evento privado ficam desmarcados; duplicados (banco e arquivo) também; ordena por data', () => {
    const rows = planScheduleImport([
      I('2026-12-19', 'Murph de Natal', 'EVENTO', { parceiro: 'Brasal', aConfirmar: true }),
      I('2026-12-25', 'Natal', 'FERIADO'),
      I('2026-09-27', 'Evento privado (locação)', 'PRIVADO'),
      I('2026-09-12', 'Nação Celebration — Etapa 3', 'EVENTO'),
      I('2026-09-12', 'Nação Celebration - Etapa 3', 'EVENTO'),
      I('2026-09-01', 'Tema do mês: Superação', 'TEMA_DO_MES', { dataFim: '2026-09-30' }),
      I('2026-11-01', 'Renovação Antecipada 2027', 'CAMPANHA', { campanhaTipo: 'RENOVACAO', aConfirmar: true }),
      I('2026-11-01', 'Campanha sem tipo', 'CAMPANHA', { campanhaTipo: 'INVENTADO' }),
    ], today, new Set([dupKey('Murph de natal', '2026-12-19')]), 'cronograma.docx');
    expect(rows.map((r) => r.startDate)).toEqual([...rows.map((r) => r.startDate)].sort());
    const by = (t: string) => rows.filter((r) => r.title.startsWith(t));
    expect(by('Murph')[0]).toMatchObject({ include: false, duplicate: true, target: 'evento', status: 'PLANEJADO' });
    expect(by('Murph')[0]!.notes).toContain('Parceiro/patrocínio: Brasal');
    expect(by('Natal')[0]!.include).toBe(false);
    expect(by('Evento privado')[0]!.include).toBe(false);
    expect(by('Nação Celebration').map((r) => [r.include, r.duplicate])).toEqual([[true, false], [false, true]]);
    expect(by('Tema do mês')[0]).toMatchObject({ include: true, target: 'item', endDate: '2026-09-30' });
    expect(by('Renovação')[0]).toMatchObject({ target: 'campanha', status: 'IDEIA', campaignType: 'RENOVACAO' });
    expect(by('Campanha sem tipo')[0]!.campaignType).toBe('INSTITUCIONAL');
  });

  it('repetir no ano seguinte mantém o dia da semana', () => {
    expect(nextYearSameWeekday('2026-09-12')).toBe('2027-09-11'); // sábado → sábado
    expect(new Date('2027-09-11T12:00:00Z').getUTCDay()).toBe(new Date('2026-09-12T12:00:00Z').getUTCDay());
  });
});
