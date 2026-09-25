import { describe, expect, it } from 'vitest';
import { formatMinutes, initials } from '@/lib/format';

describe('formatMinutes — minutos inteiros só viram texto na borda', () => {
  it.each([
    [0, '0h'],
    [30, '0h30'],
    [60, '1h'],
    [90, '1h30'],
    [125, '2h05'],
    [-120, '-2h'],
    [-30, '-0h30'],
    [7 * 60 + 30, '7h30'],
  ])('%i min → %s', (min, txt) => expect(formatMinutes(min)).toBe(txt));
});

describe('initials', () => {
  it('usa primeira e última palavra', () => expect(initials('Maria da Silva')).toBe('MS'));
  it('aceita nome único', () => expect(initials('Rafa')).toBe('R'));
  it('ignora espaços extras', () => expect(initials('  Ramon  ')).toBe('R'));
});
