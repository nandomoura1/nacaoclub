import { describe, expect, it } from 'vitest';
import { compareHours, periodMinutes, periodOf, planFrom, replaceTeacher, resulting, weekdayCounts, weeklyMinutes, type SimItem } from '@/domain/grade-sim';

const it_ = (o: Partial<SimItem> & { key: string }): SimItem => ({
  slotId: o.key, baseVersionId: `v-${o.key}`, weekday: 1, startMin: 420, durationMin: 60, modalityId: 'cf', activityTypeId: 'aula', spaceId: null, label: null,
  people: [{ teacherId: 'ana', role: 'TITULAR' }], ...o,
});
const counts = (id: string) => id !== 'personal';

describe('simulação de grade', () => {
  const current = [it_({ key: 'a' }), it_({ key: 'b', weekday: 3 }), it_({ key: 'c', weekday: 5, people: [{ teacherId: 'bia', role: 'TITULAR' }] })];

  it('plano: alterar, encerrar e criar só o que mudou', () => {
    const sim = [
      it_({ key: 'a' }), // igual
      it_({ key: 'b', weekday: 3, startMin: 480 }), // mudou horário
      it_({ key: 'c', weekday: 5, removed: true, people: [{ teacherId: 'bia', role: 'TITULAR' }] }), // sai
      it_({ key: 'novo', slotId: null, baseVersionId: null, weekday: 2, people: [{ teacherId: 'bia', role: 'TITULAR' }] }), // nova
    ];
    const p = planFrom(sim, current);
    expect(p.change.map((x) => x.key)).toEqual(['b']);
    expect(p.end.map((x) => x.key)).toEqual(['c']);
    expect(p.create.map((x) => x.key)).toEqual(['novo']);
    expect(p.conflicts).toEqual([]);
  });

  it('avisa quando alguém mexeu na grade real depois da simulação, e preserva aulas novas da grade real', () => {
    const sim = [it_({ key: 'a', durationMin: 90 }), it_({ key: 'b', weekday: 3 })];
    const now = [it_({ key: 'a', baseVersionId: 'v-a2', startMin: 450 }), it_({ key: 'b', weekday: 3 }), it_({ key: 'x', weekday: 6 })];
    const p = planFrom(sim, now);
    expect(p.change.map((x) => x.key)).toEqual(['a']);
    expect(p.conflicts.map((c) => c.item.key)).toEqual(['a']);
    expect(p.untouched.map((x) => x.key)).toEqual(['x']);
    expect(resulting(sim, p).map((x) => x.key)).toEqual(['a', 'b', 'x']);
    // Aula que sumiu da grade real e a simulação ainda quer: volta como nova (com aviso).
    const gone = planFrom([it_({ key: 'z' })], []);
    expect(gone.create[0]!.slotId).toBeNull();
    expect(gone.conflicts[0]!.reason).toMatch(/encerrada/);
  });

  it('horas por semana e na competência (26→25), comparando atual × simulada', () => {
    const sim = [it_({ key: 'a', durationMin: 90 }), it_({ key: 'b', weekday: 3 }), it_({ key: 'p', slotId: null, activityTypeId: 'personal' })];
    expect(Object.fromEntries(weeklyMinutes(current, counts))).toEqual({ ana: 120, bia: 60 });
    expect(Object.fromEntries(weeklyMinutes(sim, counts))).toEqual({ ana: 150 });
    expect(compareHours(weeklyMinutes(current, counts), weeklyMinutes(sim, counts))).toEqual([
      { teacherId: 'bia', current: 60, simulated: 0, delta: -60 }, { teacherId: 'ana', current: 120, simulated: 150, delta: 30 },
    ]);
    expect(periodOf('2026-12-03')).toMatchObject({ start: '2026-11-26', end: '2026-12-25', label: 'dez/26' });
    expect(periodOf('2026-12-27')).toMatchObject({ start: '2026-12-26', end: '2027-01-25', label: 'jan/27' });
    const wc = weekdayCounts('2026-11-26', '2026-12-25'); // 30 dias
    expect(Object.values(wc).reduce((a, b) => a + b, 0)).toBe(30);
    expect(periodMinutes([it_({ key: 'a' })], counts, wc).get('ana')).toBe(60 * wc[1]!);
  });

  it('trocar professor em todas as aulas', () => {
    const r = replaceTeacher([...current, it_({ key: 'd', people: [{ teacherId: 'ana', role: 'TITULAR' }, { teacherId: 'bia', role: 'AUXILIAR' }] })], 'ana', 'bia');
    expect(r.count).toBe(3);
    expect(r.items.map((x) => x.people.map((p) => `${p.teacherId}:${p.role}`).join(','))).toEqual(['bia:TITULAR', 'bia:TITULAR', 'bia:TITULAR', 'bia:AUXILIAR']);
  });
});

describe('comparação resiste à ordem das chaves (JSONB)', () => {
  it('pessoa {role, teacherId} = {teacherId, role}', () => {
    const a = it_({ key: 'a' });
    const b = { ...a, people: [{ role: 'TITULAR', teacherId: 'ana' } as SimItem['people'][number]] };
    expect(planFrom([b], [a]).change).toEqual([]);
  });
});
