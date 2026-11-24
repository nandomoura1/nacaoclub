import { describe, expect, it } from 'vitest';
import { applyLateness, parseLateness } from '@/domain/lateness';

describe('atraso do horista — puro', () => {
  it('tira da primeira aula e segue para a seguinte', () => {
    const r = applyLateness([{ assignmentId: 'b', startMin: 420, minutes: 60 }, { assignmentId: 'a', startMin: 360, minutes: 60 }], 90);
    expect(r).toEqual({ applied: [{ assignmentId: 'a', before: 60, after: 0 }, { assignmentId: 'b', before: 60, after: 30 }], rest: 0 });
    expect(applyLateness([{ assignmentId: 'a', startMin: 360, minutes: 60 }], 90).rest).toBe(30);
  });
  it('lê o tempo digitado', () => {
    expect(parseLateness('1:00')).toBe(60);
    expect(parseLateness('0:30')).toBe(30);
    expect(parseLateness('1h30')).toBe(90);
    expect(parseLateness('45')).toBe(45);
    expect(parseLateness('45min')).toBe(45);
    expect(parseLateness('abc')).toBeNull();
  });
});
