import { describe, expect, it } from 'vitest';
import { parseHistory } from '@/domain/programming/history';
import { MOVEMENT, classifyLoad, detectLoadKg, detectMovements } from '@/domain/programming/movements';
import { computeDna, strengthScheme, timeDomain, wodFormat } from '@/domain/programming/dna';
import { CROSSFIT_HISTORY } from '@/domain/programming/history.generated';

const ids = (t: string) => detectMovements(t).map((d) => d.id);

describe('DNA · dicionário de movimentos', () => {
  it('compostos não contam em dobro e DB não vira barra', () => {
    expect(ids('10 burpee pull-up')).toEqual(['burpee-pull-up']);
    expect(ids('16 chest-to-bar pull-ups')).toEqual(['c2b']);
    expect(ids('20 alt DB snatch 15/22,5kg')).toEqual(['db-snatch']);
    expect(ids('15 thrusters (kg: 29/43)')).toEqual(['thruster']);
    expect(ids('10 BMU')).toEqual(['bar-muscle-up']);
    expect(ids('3 rope climb')).toEqual(['rope-climb']);
    expect(ids('24 box jump over')).toEqual(['box-jump-over']);
    expect(ids('30 wall ball 14/20lb')).toEqual(['wall-ball']);
  });

  it('remo é remo; "barbell row" não é monoestrutural', () => {
    expect(ids('500m row')).toEqual(['row']);
    expect(ids('10 barbell row')).toEqual([]);
    expect(ids('20/25 cal row/bike')).toEqual(expect.arrayContaining(['row', 'bike']));
  });

  it('carga Rx masculina em kg (kg: a/b, a/bkg, lb)', () => {
    expect(detectLoadKg('squat snatch (kg: 43/61)')).toBe(61);
    expect(detectLoadKg('3 hang power clean 29/43kg')).toBe(43);
    expect(detectLoadKg('thruster 95/135lb')).toBe(61);
    expect(detectLoadKg('deadlift 135/95 lb')).toBe(61);
    expect(detectLoadKg('20 wall ball')).toBeNull();
  });

  it('classifica a carga pela referência do movimento', () => {
    expect(classifyLoad(MOVEMENT.deadlift!, 100)).toBe('moderada');
    expect(classifyLoad(MOVEMENT.deadlift!, 143)).toBe('pesada');
    expect(classifyLoad(MOVEMENT['power-clean']!, 84)).toBe('pesada');
    expect(classifyLoad(MOVEMENT['power-snatch']!, 25)).toBe('leve');
    expect(classifyLoad(MOVEMENT['pull-up']!, 10)).toBeNull();
  });
});

describe('DNA · força, formatos e time domains', () => {
  it('lê esquemas de força', () => {
    expect(strengthScheme("a cada 2' 5 sets 10-8-8-6-6 @60-80%")).toEqual({ reps: [10, 8, 8, 6, 6], pctMin: 60, pctMax: 80, intervalMin: 2 });
    const s = strengthScheme('a cada 1\'30" 5x5 @75-80%');
    expect(s.reps).toEqual([5, 5, 5, 5, 5]);
    expect(s.intervalMin).toBe(1.5);
    expect(strengthScheme("a cada 2' 60%x5; 65%x4; 70%x3").reps).toEqual([5, 4, 3]);
  });

  it('time domains e formatos', () => {
    expect([5, 8, 15, 26, 35].map(timeDomain)).toEqual(['sprint', 'curto', 'medio', 'longo', 'endurance']);
    expect(wodFormat({ title: "AMRAP 12'" })).toBe('AMRAP');
    expect(wodFormat({ title: "EMOM 25'" })).toBe('EMOM / a cada');
    expect(wodFormat({ title: 'For time 21-15-9' })).toBe('For time');
  });

  it('parser: blocos, tags e dias especiais', () => {
    const s = parseHistory([
      '## 2026-09-21', 'WU 15', "FOR 10 | Back squat | a cada 2' 5 sets 10-8-8-6-6 @60-80%",
      "WOD 11 | AMRAP 11' #partner | 50 DU; 15m 1DB walking lunge 15/22,5kg; 10/6 BMU",
      '## 2026-09-07', '#feriado',
      '## 2026-09-26', 'WOD 30 | 3 rounds #benchmark:Fight Gone Bad | 800m run',
    ].join('\n'));
    expect(s.map((x) => x.date)).toEqual(['2026-09-07', '2026-09-21', '2026-09-26']);
    expect(s[0]!.special).toBe(true);
    expect(s[1]!.blocks.map((b) => [b.kind, b.minutes])).toEqual([['WU', 15], ['FOR', 10], ['WOD', 11]]);
    expect(s[1]!.blocks[2]!.tags).toEqual(['partner']);
    expect(s[2]!.blocks[0]!.tags).toEqual(['benchmark:Fight Gone Bad']);
    const dna = computeDna(s);
    expect(dna.period.sessions).toBe(2);
    expect(dna.partnerShare).toBe(50);
    expect(dna.namedWorkouts).toEqual([{ name: 'Fight Gone Bad', kind: 'benchmark', count: 1 }]);
    expect(dna.strength.withMetconShare).toBe(100);
  });
});

describe('DNA · histórico real da Nação', () => {
  const dna = computeDna(parseHistory(CROSSFIT_HISTORY));
  it('cobre ~88 semanas e ~500 aulas', () => {
    expect(dna.period.from).toBe('2024-12-02');
    expect(dna.period.weeks).toBeGreaterThanOrEqual(85);
    expect(dna.period.sessions).toBeGreaterThan(450);
  });
  it('assinatura: médio domina, força na primeira metade da semana, sábado em dupla', () => {
    const td = Object.fromEntries(dna.timeDomains.map((t) => [t.id, t.share]));
    expect(td.medio).toBeGreaterThan(td.curto!);
    expect(td.medio).toBeGreaterThan(td.longo!);
    const wd = Object.fromEntries(dna.weekdays.map((w) => [w.weekday, w]));
    expect(wd[1]!.strengthShare).toBeGreaterThan(wd[6]!.strengthShare);
    expect(wd[6]!.partnerShare).toBeGreaterThan(wd[1]!.partnerShare);
    expect(dna.strength.repRanges.find(([r]) => r === '3–5')![1]).toBeGreaterThan(dna.strength.repRanges.find(([r]) => r === '6–8')![1]);
  });
});
