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

import { eventCampaignDay, eventNameKey } from '@/domain/marketing/calendar';
describe('campanha de evento no calendário', () => {
  const names = new Set([eventNameKey('4ª Edição NAÇÃO CELEBRATION 2026')]);
  const c = (o: Partial<{ eventId: string | null; type: string; name: string }>) => ({ eventId: null, type: 'EVENTO', name: 'X', start: '2026-10-21', end: '2026-11-07', ...o });
  it('some quando o evento já está no calendário (ligada ou mesmo nome)', () => {
    expect(eventCampaignDay(c({ eventId: 'e1' }), names)).toEqual({ skip: true });
    expect(eventCampaignDay(c({ name: '4ª edição Nação Celebration 2026 ' }), names)).toEqual({ skip: true });
  });
  it('tipo Evento sem evento cadastrado: só no dia do evento, sem arrastar; outras campanhas mantêm o período', () => {
    expect(eventCampaignDay(c({ name: 'Confraternização' }), names)).toEqual({ skip: false, start: '2026-11-07', end: '2026-11-07', pinned: true });
    expect(eventCampaignDay(c({ type: 'RENOVACAO', name: 'Black November' }), names)).toEqual({ skip: false, start: '2026-10-21', end: '2026-11-07', pinned: false });
  });
});
