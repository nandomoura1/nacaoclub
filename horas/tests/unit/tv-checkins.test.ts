import { describe, expect, it } from 'vitest';
import { currentClass, minutesOf, sameClassTime, suggestModality, tvLabel } from '@/domain/tv-checkins';

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
  it('aula atual: 15 min antes até 5 min depois; sobreposição = a mais próxima', () => {
    const cls = [{ startMin: 420, durationMin: 60 }, { startMin: 480, durationMin: 60 }];
    expect(currentClass(cls, 400)).toBeNull();
    expect(currentClass(cls, 406)?.startMin).toBe(420);
    expect(currentClass(cls, 470)?.startMin).toBe(480); // 07h50: a das 8h já é a "atual"
    expect(currentClass(cls, 545)?.startMin).toBe(480); // 5 min depois do fim ainda vale
    expect(currentClass(cls, 546)).toBeNull();
    expect(sameClassTime(420, 425)).toBe(true);
    expect(sameClassTime(420, 435)).toBe(false);
  });
  it('sugestão de modalidade pelo nome da turma', () => {
    const mods = [{ id: 'a', name: 'CrossFit' }, { id: 'b', name: 'Funcional' }, { id: 'c', name: 'Funcional Beach' }];
    expect(suggestModality(['CROSSFIT 07H', ''], mods)?.id).toBe('a');
    expect(suggestModality(['Turma A', 'Funcional Beach'], mods)?.id).toBe('c');
    expect(suggestModality(['Pilates', 'Bem-estar'], mods)).toBeNull();
  });
});
