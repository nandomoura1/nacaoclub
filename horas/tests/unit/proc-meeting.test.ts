import { describe, expect, it } from 'vitest';
import { focusMessage, isoWeek, needsAttention, previousWeek, scoreboard, weekBounds } from '@/domain/proc-meeting';

const d = (o: Partial<Parameters<typeof needsAttention>[0]> = {}) => ({ status: 'ABERTA', dueDate: '2026-10-20', priority: 'MEDIA', doneAt: null, focusWeek: null, blocker: null, ownerId: 'u1', ...o });

describe('Reunião de líderes — regras puras', () => {
  it('semana', () => {
    expect(isoWeek('2026-10-15')).toBe('2026-W42');
    expect(previousWeek('2026-10-15')).toBe('2026-W41');
    expect(weekBounds('2026-10-15')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('placar', () => {
    const s = scoreboard([
      d({ focusWeek: '2026-W42', status: 'CONCLUIDA', doneAt: '2026-10-14T15:00:00Z' }),
      d({ focusWeek: '2026-W42' }),
      d({ dueDate: '2026-10-10' }), // atrasada
      d({ blocker: 'Esperando fornecedor' }),
      d({ ownerId: null, dueDate: null }),
      d({ status: 'CONCLUIDA', doneAt: '2026-10-01T12:00:00Z' }), // fora da semana
    ], '2026-W42', '2026-10-15');
    expect(s).toEqual({ focus: 2, focusDone: 1, doneWeek: 1, late: 1, blocked: 1, noOwner: 1, noDue: 1, open: 4 });
  });
  it('o que precisa de atenção', () => {
    expect(needsAttention(d({ dueDate: '2026-10-01', blocker: 'x' }), '2026-10-15')).toEqual(['atrasada', 'impedida']);
    expect(needsAttention(d({ status: 'AGUARDANDO', dueDate: null }), '2026-10-15')).toEqual(['aguardando terceiros', 'sem prazo']);
    expect(needsAttention(d({ status: 'CONCLUIDA', dueDate: '2026-10-01' }), '2026-10-15')).toEqual([]);
  });
  it('mensagem do foco', () => {
    const m = focusMessage('Carla Souza', '2026-10-15', [{ title: 'Trocar filtro da piscina', dueDate: '2026-10-17', sector: 'Manutenção' }], 'Comprar cloro em lote');
    expect(m).toContain('Oi, Carla!');
    expect(m).toContain('• Trocar filtro da piscina _(até 17/10)_');
    expect(m).toContain('*Decisões:*\nComprar cloro em lote');
  });
});
