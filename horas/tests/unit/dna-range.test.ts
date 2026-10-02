import { describe, expect, it } from 'vitest';
import { dnaRange } from '@/app/(app)/treinos/_components/DnaReport';

describe('período do DNA na URL', () => {
  it('lê de/até; "até" vazio ou antes do "de" vale até hoje; data inválida é ignorada', () => {
    expect(dnaRange({})).toEqual({ from: null, to: null });
    expect(dnaRange({ de: '2026-03-01', ate: '2026-03-31' })).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(dnaRange({ de: '2026-06-01' })).toEqual({ from: '2026-06-01', to: null });
    expect(dnaRange({ de: '2026-06-01', ate: '2026-03-31' })).toEqual({ from: '2026-06-01', to: null });
    expect(dnaRange({ de: 'x', ate: '2026-03-31' })).toEqual({ from: null, to: '2026-03-31' });
  });
});
