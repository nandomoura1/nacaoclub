import { describe, expect, it } from 'vitest';
import { daysLabel, gradeTeamText, personSchedule } from '@/domain/grade-print';

const c = (weekday: number, h: number, people: string[], modality = 'CrossFit', dur = 60) =>
  ({ weekday, startMin: h * 60, durationMin: dur, modality, people: people.map((id) => ({ teacherId: id, name: id })) });

describe('grade em texto por pessoa', () => {
  it('rótulo dos dias', () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(daysLabel([1, 3, 5])).toBe('Seg, Qua e Sex');
    expect(daysLabel([1, 2, 3, 5])).toBe('Seg a Qua e Sex');
    expect(daysLabel([2, 4])).toBe('Ter e Qui');
    expect(daysLabel([6])).toBe('Sáb');
  });

  it('junta aulas seguidas e dias com o mesmo horário', () => {
    const cls = [1, 2, 3, 4, 5].flatMap((d) => [c(d, 5, []), c(d, 6, []), c(d, 7, [])]);
    expect(personSchedule(cls)).toBe('Seg a Sex - 5h às 8h');
    expect(personSchedule([...cls, c(1, 17, []), c(3, 17, []), c(6, 8, [], 'CrossFit', 90)]))
      .toBe('Seg e Qua - 5h às 8h e 17h às 18h; Ter, Qui, Sex - 5h às 8h; Sáb - 8h às 9h30'.replace('Ter, Qui, Sex', 'Ter, Qui e Sex'));
  });

  it('detalhado: modalidade ao lado do nome, horários embaixo, linha em branco entre pessoas', () => {
    const cls = [1, 2, 3, 4, 5].flatMap((d) => [c(d, 5, ['André', 'Lucas']), c(d, 6, ['André', 'Lucas']), c(d, 7, ['André', 'Lucas']), c(d, 8, ['Lucas'], 'Academia', 120)]);
    cls.push(c(6, 9, ['Bia'], 'Funcional'), c(1, 18, ['Bia']), c(3, 18, ['Bia']));
    const t = gradeTeamText(cls, new Map([['Lucas', { intern: true }]]), { title: 'Grade' });
    expect(t).toBe([
      '📋 *Grade*', '',
      '👨‍🏫 *PROFESSORES*', '',
      '*André* · CrossFit', 'Seg a Sex - 5h às 8h', '',
      '*Bia*', 'CrossFit: Seg e Qua - 18h às 19h', 'Funcional: Sáb - 9h às 10h', '', '',
      '🎓 *ESTAGIÁRIOS*', '',
      '*Lucas*', 'Academia: Seg a Sex - 8h às 10h', 'CrossFit: Seg a Sex - 5h às 8h',
    ].join('\n'));
  });

  it('linha: uma linha por pessoa', () => {
    const cls = [1, 2, 3, 4, 5].flatMap((d) => [c(d, 5, ['André', 'Lucas']), c(d, 6, ['André', 'Lucas']), c(d, 7, ['André', 'Lucas']), c(d, 8, ['Lucas'], 'Academia', 120)]);
    const t = gradeTeamText(cls, new Map([['Lucas', { intern: true }]]), { title: 'Grade · CrossFit', layout: 'linha' });
    expect(t).toBe([
      '📋 *Grade · CrossFit*', '',
      '👨‍🏫 *PROFESSORES*', '', '• *André* - Seg a Sex - 5h às 8h', '', '',
      '🎓 *ESTAGIÁRIOS*', '', '• *Lucas* - Seg a Sex - 5h às 10h',
    ].join('\n'));
  });
});
