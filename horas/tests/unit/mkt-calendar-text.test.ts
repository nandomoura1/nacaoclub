import { describe, expect, it } from 'vitest';
import { calendarWhatsAppText, type CalEntry } from '@/domain/marketing/calendar';

const e = (kind: CalEntry['kind'], title: string, start: string, end = start, extra: Partial<CalEntry> = {}): CalEntry => ({ kind, id: title, title, start, end, ...extra });

describe('calendário de marketing → texto de WhatsApp', () => {
  const entries = [
    e('feriado', 'Consciência Negra', '2026-11-20'),
    e('campanha', 'Black Nação', '2026-11-01', '2026-11-30', { tag: 'Promoção' }),
    e('evento', 'Torneio de Futevôlei', '2026-11-14'),
    e('evento', 'Evento cancelado', '2026-11-15', '2026-11-15', { status: 'CANCELADO' }),
    e('item', 'Aviso: piscina fechada', '2026-11-10', '2026-11-10', { tag: 'Aviso' }),
    e('tarefa', 'Arte do torneio', '2026-11-05'),
    e('evento', 'Fora do mês', '2026-12-05'),
    e('campanha', 'Começou antes', '2026-10-20', '2026-11-02'),
  ];

  it('agrupa por tipo, ordena por data, ignora cancelados e o que está fora do período', () => {
    const t = calendarWhatsAppText(entries, { from: '2026-11-01', to: '2026-11-30', title: 'Novembro 2026', kinds: ['campanha', 'evento', 'item', 'feriado'] });
    expect(t).toBe([
      '📅 *Calendário de Marketing — Novembro 2026*',
      '',
      '🎯 *Campanhas*',
      '• 20/10 a 02/11 — Começou antes',
      '• 01/11 a 30/11 — Black Nação _(Promoção)_',
      '',
      '🎉 *Eventos*',
      '• sáb 14/11 — Torneio de Futevôlei',
      '',
      '📌 *Datas e avisos*',
      '• ter 10/11 — Aviso: piscina fechada _(Aviso)_',
      '',
      '🏖️ *Feriados*',
      '• sex 20/11 — Consciência Negra',
    ].join('\n'));
  });

  it('tarefas só entram quando pedidas; período vazio avisa', () => {
    expect(calendarWhatsAppText(entries, { from: '2026-11-01', to: '2026-11-30', title: 'x', kinds: ['tarefa'] })).toContain('• qui 05/11 — Arte do torneio');
    expect(calendarWhatsAppText(entries, { from: '2027-01-01', to: '2027-01-31', title: 'x', kinds: ['evento'] })).toContain('Nada marcado');
  });
});

import { weekBars } from '@/domain/marketing/calendar';
describe('barras de vários dias na semana', () => {
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  const e = (title: string, start: string, end: string): CalEntry => ({ kind: 'campanha', id: title, title, start, end });
  it('corta na semana, marca continuação e empilha sem sobrepor', () => {
    const bars = weekBars([e('Mês da saúde', '2026-11-01', '2026-11-30'), e('Colônia', '2026-11-12', '2026-11-20'), e('Fora', '2026-12-01', '2026-12-10'), e('Curta', '2026-11-09', '2026-11-10')], week);
    expect(bars.map((b) => [b.entry.title, b.col, b.span, b.lane, b.fromBefore, b.goesAfter])).toEqual([
      ['Mês da saúde', 0, 7, 0, true, true],
      ['Curta', 0, 2, 1, false, false],
      ['Colônia', 3, 4, 1, false, true],
    ]);
  });
});
