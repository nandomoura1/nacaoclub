import { describe, expect, it } from 'vitest';
import { dayType, defaultShifts, dutyTitle, dutyWarnings, dutyWhatsapp, rangeLabel } from '@/domain/duty';

const A = { id: 'a', name: 'André' };
const B = { id: 'b', name: 'Bruna' };

describe('escalas · domínio', () => {
  it('tipo do dia: sábado, domingo, feriado e dia útil', () => {
    const hol = new Set(['2026-10-12']);
    expect(dayType('2026-10-03', hol)).toBe('SAB');
    expect(dayType('2026-10-04', hol)).toBe('DOM');
    expect(dayType('2026-10-12', hol)).toBe('FERIADO');
    expect(dayType('2026-10-06', hol)).toBe('SEMANA');
  });

  it('turnos padrão por tipo de dia (Academia sábado 7h–17h, domingo 8h–14h; CrossFit só sábado)', () => {
    const academia = { SAB: [[420, 1020]], DOM: [[480, 840]], FERIADO: [[480, 840]] } as const;
    expect(defaultShifts(academia as never, 'SAB')).toEqual([{ startMin: 420, endMin: 1020 }]);
    expect(defaultShifts(academia as never, 'FERIADO')).toEqual([{ startMin: 480, endMin: 840 }]);
    expect(defaultShifts({ SAB: [[420, 660]], DOM: [] }, 'DOM')).toEqual([]);
    expect(defaultShifts(academia as never, 'SEMANA')).toEqual([]);
  });

  it('avisa turno vazio, pessoa em dois lugares, afastamento e aula na grade', () => {
    const w = dutyWarnings(
      [
        { sector: 'Academia', date: '2026-10-03', startMin: 420, endMin: 720, people: [A] },
        { sector: 'CrossFit e HYROX', date: '2026-10-03', startMin: 600, endMin: 660, people: [A, B] },
        { sector: 'Brinquedoteca', date: '2026-10-03', startMin: 480, endMin: 840, people: [] },
        { sector: 'Academia', date: '2026-10-04', startMin: 480, endMin: 840, people: [B] },
      ],
      [{ teacherId: 'b', date: '2026-10-03', startMin: 630, endMin: 690, label: 'aula de Funcional' }],
      [{ teacherId: 'b', start: '2026-10-04', end: '2026-10-10', label: 'Férias' }],
    );
    expect(w).toContain('Brinquedoteca 03/10 08:00–14:00: turno sem ninguém.');
    expect(w).toContain('André está em dois turnos ao mesmo tempo: Academia e CrossFit e HYROX (03/10 10:00–11:00).');
    expect(w).toContain('Bruna está de férias em 04/10 (Academia).');
    expect(w.some((x) => x.startsWith('Bruna tem aula de Funcional às 10:30'))).toBe(true);
    // turnos encostados (7–12 e 12–17) não são conflito
    expect(dutyWarnings([
      { sector: 'Academia', date: '2026-10-03', startMin: 420, endMin: 720, people: [A] },
      { sector: 'Academia', date: '2026-10-03', startMin: 720, endMin: 1020, people: [A] },
    ])).toEqual([]);
  });

  it('títulos e faixas', () => {
    expect(rangeLabel(['2026-10-04', '2026-10-03'])).toBe('03 e 04/10');
    expect(rangeLabel(['2026-10-31', '2026-11-01'])).toBe('31/10 a 01/11');
    expect(dutyTitle('2026-10-03', '2026-10-04')).toBe('Fim de semana 03 e 04/10');
    expect(dutyTitle('2026-10-12', '2026-10-12', { '2026-10-12': 'Nossa Senhora Aparecida' })).toBe('Feriado · Nossa Senhora Aparecida 12/10');
    expect(dutyTitle('2026-10-03', '2026-10-12')).toBe('03/10 a 12/10');
  });

  it('texto de WhatsApp: setor, dia, horário e nomes; setor vazio não aparece', () => {
    const t = dutyWhatsapp({
      title: 'Fim de semana 03 e 04/10',
      holidays: {},
      sectors: [
        { name: 'Academia', shifts: [
          { date: '2026-10-04', startMin: 480, endMin: 840, people: [B] },
          { date: '2026-10-03', startMin: 420, endMin: 1020, people: [A, B], notes: 'Revezar almoço' },
        ] },
        { name: 'Futevôlei', shifts: [] },
        { name: 'Brinquedoteca', shifts: [{ date: '2026-10-03', startMin: 480, endMin: 840, people: [] }] },
      ],
    });
    expect(t).toBe([
      '*🔵 ESCALA · FIM DE SEMANA 03 E 04/10*',
      '', '*ACADEMIA*',
      '_Sábado 03/10_', '• 07:00–17:00: André, Bruna — Revezar almoço',
      '_Domingo 04/10_', '• 08:00–14:00: Bruna',
      '', '*BRINQUEDOTECA*',
      '_Sábado 03/10_', '• 08:00–14:00: a definir',
      '', '_Muitos esportes, muitas paixões, uma Nação!_ 💙',
    ].join('\n'));
  });
});
