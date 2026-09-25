import { describe, expect, it } from 'vitest';
import { addDays, eachDay, formatClock, isIsoDate, parseClock, weekdayOf } from '@/domain/dates';
import { easterSunday, holidaysOf } from '@/domain/holidays';
import { normalizeName } from '@/domain/names';

describe('datas de calendário (sem fuso)', () => {
  it('dia da semana ISO: 1 = segunda, 7 = domingo', () => {
    expect(weekdayOf('2026-09-07')).toBe(1); // segunda, Independência
    expect(weekdayOf('2026-09-01')).toBe(2); // terça
    expect(weekdayOf('2026-11-01')).toBe(7); // domingo
  });
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // bissexto
  });
  it('eachDay é inclusivo nas duas pontas', () => {
    expect(eachDay('2026-08-26', '2026-09-25')).toHaveLength(31);
  });
  it('valida ISO de verdade (31/02 não existe)', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoDate('26/08/2026')).toBe(false);
  });
  it('lê horários no formato da planilha', () => {
    expect(parseClock('5h')).toBe(300);
    expect(parseClock('5h30')).toBe(330);
    expect(parseClock('05:30')).toBe(330);
    expect(parseClock('12h15')).toBe(735);
    expect(parseClock('15H')).toBe(900);
    expect(parseClock('25h')).toBeNull();
    expect(formatClock(330)).toBe('05:30');
  });
});

describe('feriados', () => {
  it('Páscoa conhecida', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  it('2026: móveis e fixos nas datas certas', () => {
    const byName = Object.fromEntries(holidaysOf(2026).map((h) => [h.name, h.date]));
    expect(byName['Sexta-feira Santa']).toBe('2026-04-03');
    expect(byName['Corpus Christi']).toBe('2026-06-04');
    expect(byName['Carnaval (terça)']).toBe('2026-02-17');
    expect(byName['Finados']).toBe('2026-11-02');
    expect(byName['Dia do Evangélico (DF)']).toBe('2026-11-30');
  });
});

describe('normalização de nomes', () => {
  it('ignora acento, caixa e espaços', () => {
    expect(normalizeName('  LUÍZA   Eduarda ')).toBe('luiza eduarda');
    expect(normalizeName('Dionízio')).toBe(normalizeName('dionizio'));
  });
});
