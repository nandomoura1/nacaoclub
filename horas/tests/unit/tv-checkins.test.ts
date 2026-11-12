import { describe, expect, it } from 'vitest';
import { classesOfHour, currentClass, minutesOf, nextClass, sameClassTime, sameHour, suggestModality, tvLabel } from '@/domain/tv-checkins';

describe('Check-ins na TV: regras puras', () => {
  it('rótulo: primeiro nome + inicial do último sobrenome (sem partículas)', () => {
    expect(tvLabel('ANA MARIA DE SOUZA')).toBe('Ana S.');
    expect(tvLabel('joão da silva')).toBe('João S.');
    expect(tvLabel('Bruno')).toBe('Bruno');
    expect(tvLabel('  ')).toBe('Aluno');
    expect(tvLabel('Carla dos')).toBe('Carla');
  });
  it('horários da Tecnofit em minutos', () => {
    expect(minutesOf('2026-11-12 07:00:00')).toBe(420);
    expect(minutesOf('19:30')).toBe(1170);
    expect(minutesOf(null)).toBeNull();
  });
  it('turma da hora cheia: 5h00–5h59 = turma das 5h; 7h sem turma mostra a próxima', () => {
    const hyrox = [{ startMin: 300, durationMin: 60 }, { startMin: 360, durationMin: 60 }, { startMin: 600, durationMin: 60 }];
    expect(currentClass(hyrox, 300)?.startMin).toBe(300);
    expect(currentClass(hyrox, 359)?.startMin).toBe(300);
    expect(currentClass(hyrox, 360)?.startMin).toBe(360); // às 6h00 troca sozinha
    expect(classesOfHour(hyrox, 430)).toEqual([]); // 7h10: sem turma
    expect(nextClass(hyrox, 430)?.startMin).toBe(600);
    expect(sameHour(300, 315)).toBe(true);
    expect(sameHour(300, 360)).toBe(false);
    expect(sameClassTime(420, 425)).toBe(true);
  });
  it('sugestão de modalidade pelo nome da turma', () => {
    const mods = [{ id: 'a', name: 'CrossFit' }, { id: 'b', name: 'Funcional' }, { id: 'c', name: 'Funcional Beach' }];
    expect(suggestModality(['CROSSFIT 07H', ''], mods)?.id).toBe('a');
    expect(suggestModality(['Turma A', 'Funcional Beach'], mods)?.id).toBe('c');
    expect(suggestModality(['Pilates', 'Bem-estar'], mods)).toBeNull();
  });
});
