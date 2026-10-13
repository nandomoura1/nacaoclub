import { describe, expect, it } from 'vitest';
import { addDaysIso, demandOrder, isLate, sectorStats, type DemandLite } from '@/domain/processos';

const D = (o: Partial<DemandLite>): DemandLite => ({ status: 'ABERTA', dueDate: null, priority: 'MEDIA', doneAt: null, ...o });
const today = '2026-10-13';

describe('gestão de processos (puro)', () => {
  it('atrasada = aberta com prazo antes de hoje', () => {
    expect(isLate(D({ dueDate: '2026-10-12' }), today)).toBe(true);
    expect(isLate(D({ dueDate: '2026-10-13' }), today)).toBe(false);
    expect(isLate(D({ dueDate: '2026-10-01', status: 'CONCLUIDA' }), today)).toBe(false);
    expect(addDaysIso('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('semáforo do setor', () => {
    expect(sectorStats([], today).health).toBe('sem_demandas');
    expect(sectorStats([D({ dueDate: '2026-10-30' })], today).health).toBe('verde');
    expect(sectorStats([D({ dueDate: '2026-10-10' })], today).health).toBe('amarelo');
    expect(sectorStats([D({ priority: 'URGENTE' })], today).health).toBe('amarelo');
    expect(sectorStats([D({ dueDate: '2026-10-14' }), D({ dueDate: '2026-10-15' }), D({ dueDate: '2026-10-20' })], today).health).toBe('amarelo');
    expect(sectorStats([D({ dueDate: '2026-10-10' }), D({ dueDate: '2026-10-11' })], today).health).toBe('vermelho');
    expect(sectorStats([D({ dueDate: '2026-10-10', priority: 'URGENTE' })], today).health).toBe('vermelho');
    const s = sectorStats([D({ status: 'CONCLUIDA', doneAt: '2026-10-05T10:00:00Z' }), D({ status: 'CONCLUIDA', doneAt: '2026-09-30T10:00:00Z' }), D({})], today);
    expect([s.open, s.doneMonth]).toEqual([1, 1]);
  });

  it('ordem: atrasadas, prioridade, prazo; encerradas no fim', () => {
    const list = [
      { k: 'feita', ...D({ status: 'CONCLUIDA' }) }, { k: 'baixa', ...D({ priority: 'BAIXA' }) }, { k: 'urgente', ...D({ priority: 'URGENTE' }) },
      { k: 'atrasada', ...D({ dueDate: '2026-10-01', priority: 'BAIXA' }) }, { k: 'media-cedo', ...D({ dueDate: '2026-10-14' }) }, { k: 'media-tarde', ...D({ dueDate: '2026-11-01' }) },
    ].sort((a, b) => demandOrder(a, b, today)).map((x) => x.k);
    expect(list).toEqual(['atrasada', 'urgente', 'media-cedo', 'media-tarde', 'baixa', 'feita']);
  });
});
