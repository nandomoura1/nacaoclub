import { describe, expect, it } from 'vitest';
import { formatSeconds, isValidTimeInput, parseTimeToSeconds } from '@/lib/time';
import { effectiveTime, scoreWod3, WOD3_CAP_SECONDS } from '@/lib/scoring/wod3';
import { team, w3 } from './helpers';

describe('Conversão de tempo', () => {
  // §47 — caso do enunciado
  it('converte 14:32 em 872 segundos', () => {
    expect(parseTimeToSeconds('14:32')).toBe(872);
  });

  it('formata 872 segundos como 14:32', () => {
    expect(formatSeconds(872)).toBe('14:32');
  });

  it('faz o caminho de volta sem perder informação', () => {
    for (const value of ['0:07', '9:59', '13:58', '15:10', '20:00']) {
      expect(formatSeconds(parseTimeToSeconds(value))).toBe(value.replace(/^0(\d)/, '$1'));
    }
  });

  it('rejeita formatos inválidos', () => {
    for (const bad of ['14:99', 'abc', '', '14:', ':32', '14:5']) {
      expect(parseTimeToSeconds(bad)).toBeNull();
      expect(isValidTimeInput(bad)).toBe(false);
    }
  });

  it('mostra travessão quando não há tempo', () => {
    expect(formatSeconds(null)).toBe('—');
  });
});

describe('WOD 3 — METCON', () => {
  it('menor tempo = melhor posição (13:58, 14:32, 15:10)', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w3('team-1', parseTimeToSeconds('14:32')),
      w3('team-2', parseTimeToSeconds('13:58')),
      w3('team-3', parseTimeToSeconds('15:10')),
    ];
    const scores = scoreWod3(teams, results);

    expect(scores.get('team-2')).toMatchObject({ rank: 1, points: 1, timeSeconds: 838 });
    expect(scores.get('team-1')).toMatchObject({ rank: 2, points: 2, timeSeconds: 872 });
    expect(scores.get('team-3')).toMatchObject({ rank: 3, points: 3, timeSeconds: 910 });
  });

  it('quem não concluiu recebe o CAP de 20:00 como tempo efetivo', () => {
    expect(WOD3_CAP_SECONDS).toBe(1200);
    expect(effectiveTime(w3('team-1', null, false))).toBe(1200);
    expect(formatSeconds(WOD3_CAP_SECONDS)).toBe('20:00');
  });

  // §13 e §48 — o critério NÃO é inventado
  it('PENDING_DEFINITION: incompletos ficam atrás, empatados e marcados', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w3('team-1', 872),
      w3('team-2', WOD3_CAP_SECONDS, false, { volumeCompleted: 300 }),
      w3('team-3', WOD3_CAP_SECONDS, false, { volumeCompleted: 500 }),
    ];
    const scores = scoreWod3(teams, results, { dnfPolicy: 'PENDING_DEFINITION' });

    expect(scores.get('team-1')).toMatchObject({ rank: 1, points: 1 });
    // Maior volume NÃO é usado por padrão: nada é assumido silenciosamente.
    expect(scores.get('team-2')).toMatchObject({ rank: 2, points: 2, needsDecision: true });
    expect(scores.get('team-3')).toMatchObject({ rank: 2, points: 2, needsDecision: true });
  });

  it('VOLUME_DESC: maior volume concluído fica à frente', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w3('team-1', 872),
      w3('team-2', WOD3_CAP_SECONDS, false, { volumeCompleted: 300 }),
      w3('team-3', WOD3_CAP_SECONDS, false, { volumeCompleted: 500 }),
    ];
    const scores = scoreWod3(teams, results, { dnfPolicy: 'VOLUME_DESC' });

    expect(scores.get('team-3')).toMatchObject({ rank: 2, points: 2 });
    expect(scores.get('team-2')).toMatchObject({ rank: 3, points: 3 });
  });

  it('TIED_LAST: todos os incompletos ocupam a última posição', () => {
    const teams = [team(1), team(2), team(3)];
    const results = [
      w3('team-1', 872),
      w3('team-2', WOD3_CAP_SECONDS, false),
      w3('team-3', WOD3_CAP_SECONDS, false),
    ];
    const scores = scoreWod3(teams, results, { dnfPolicy: 'TIED_LAST' });

    expect(scores.get('team-2')).toMatchObject({ rank: 3, points: 3 });
    expect(scores.get('team-3')).toMatchObject({ rank: 3, points: 3 });
  });

  it('empate de tempo exato gera mesma posição', () => {
    const teams = [team(1), team(2), team(3)];
    const scores = scoreWod3(teams, [w3('team-1', 872), w3('team-2', 872), w3('team-3', 900)]);

    expect(scores.get('team-1')).toMatchObject({ rank: 1, points: 1, tied: true });
    expect(scores.get('team-2')).toMatchObject({ rank: 1, points: 1, tied: true });
    expect(scores.get('team-3')).toMatchObject({ rank: 3, points: 3 });
  });

  it('dupla sem lançamento não é ranqueada', () => {
    const teams = [team(1), team(2)];
    const scores = scoreWod3(teams, [w3('team-1', 872), w3('team-2', null, false, {})]);
    // sem tempo, sem "concluiu" e sem volume => nada foi lançado ainda.
    // Um DNF real SEMPRE chega com o CAP gravado (§13), então os dois casos
    // nunca se confundem.
    expect(scores.get('team-2')?.hasResult).toBe(false);
  });
});
