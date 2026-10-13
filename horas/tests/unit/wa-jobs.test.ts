import { describe, expect, it } from 'vitest';
import { dueJobs, dutyPersonalMessage, isoWeek, leaderMessage, monthlyGradeMessage, nextSaturday, periodKey } from '@/domain/wa-jobs';

describe('envios automáticos (puro)', () => {
  it('cada envio no seu dia', () => {
    expect(dueJobs('2026-10-19')).toEqual(['LIDERES']); // segunda
    expect(dueJobs('2026-10-23')).toEqual(['ESCALA_FDS']); // sexta
    expect(dueJobs('2026-10-21')).toEqual([]);
    expect(dueJobs('2026-06-01')).toEqual(['LIDERES', 'GRADE_MENSAL']); // segunda e dia 1
    expect(dueJobs('2027-01-01')).toEqual(['ESCALA_FDS', 'GRADE_MENSAL']); // sexta e dia 1
  });

  it('período de cada envio (não duplica)', () => {
    expect(isoWeek('2026-10-19')).toBe('2026-W43');
    expect(isoWeek('2026-10-25')).toBe('2026-W43');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(nextSaturday('2026-10-23')).toBe('2026-10-24');
    expect(nextSaturday('2026-10-24')).toBe('2026-10-24');
    expect(periodKey('ESCALA_FDS', '2026-10-22')).toBe('2026-10-24'); // quinta (manual) e sexta = mesmo fim de semana
    expect(periodKey('ESCALA_FDS', '2026-10-23')).toBe('2026-10-24');
    expect(periodKey('GRADE_MENSAL', '2026-11-01')).toBe('2026-11');
  });

  it('textos', () => {
    const l = leaderMessage({ name: 'Ana Souza', url: 'https://x/processos', demands: [
      { title: 'Freezer', sector: 'Lanchonete', dueDate: '2026-10-15', late: true, priority: 'URGENTE' },
      { title: 'Açaí', sector: 'Lanchonete', dueDate: '2026-10-22', late: false, priority: 'MEDIA' },
    ] });
    expect(l).toContain('Bom dia, Ana!');
    expect(l).toContain('*Atrasadas (1)*');
    expect(l).toContain('🔴 Freezer — venceu 15/10');
    expect(l).toContain('Açaí — vence 22/10');
    const d = dutyPersonalMessage({ name: 'Bruno Lima', shifts: [{ date: '2026-10-25', startMin: 480, endMin: 840, sector: 'Recepção' }, { date: '2026-10-24', startMin: 420, endMin: 1020, sector: 'Academia' }] });
    expect(d.indexOf('sábado 24/10')).toBeLessThan(d.indexOf('domingo 25/10'));
    expect(d).toContain('07:00–17:00 · Academia');
    expect(monthlyGradeMessage({ month: '2026-11', gradeText: 'GRADE' })).toMatch(/Grade de novembro de 2026[\s\S]*GRADE[\s\S]*OK/);
  });
});
