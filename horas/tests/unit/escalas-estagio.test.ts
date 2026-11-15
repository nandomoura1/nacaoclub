import { describe, expect, it } from 'vitest';
import { receivesTransport } from '@/domain/escalas/passagem';
import { fiveByTwo, weeklyOffs } from '@/domain/escalas/engine';
import { BOND_LABEL } from '@/domain/escalas/labels';
import type { Member } from '@/domain/escalas/types';

describe('Escalas 5x2 · vínculo Estágio', () => {
  it('é 5x2, recebe auxílio-transporte e tem rótulo', () => {
    const m = { bond: 'ESTAGIO' } as Member;
    expect(fiveByTwo(m)).toBe(true);
    expect(weeklyOffs(m)).toBe(2);
    expect(receivesTransport('ESTAGIO')).toBe(true);
    expect(receivesTransport('MEI')).toBe(false);
    expect(BOND_LABEL.ESTAGIO).toBe('Estágio');
  });
});
