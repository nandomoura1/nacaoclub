import { describe, expect, it } from 'vitest';
import { wod1RowSchema, wod2RowSchema, wod3RowSchema, teamSchema } from '@/lib/validation';

describe('Validação do lançamento', () => {
  it('aceita vírgula decimal nas cargas', () => {
    const r = wod1RowSchema.parse({
      teamId: 't1',
      strictPressAthlete1: '62,5',
      strictPressAthlete2: '',
      backSquatAthlete1: null,
      backSquatAthlete2: null,
      deadliftAthlete1: null,
      deadliftAthlete2: null,
    });
    expect(r.strictPressAthlete1).toBe(62.5);
    expect(r.strictPressAthlete2).toBeNull();
  });

  // §12 — a REGRA CRÍTICA da troca a cada 500 m
  it('recusa corrida fora do múltiplo de 500 m', () => {
    expect(wod2RowSchema.safeParse({ teamId: 't1', runKm: '3,2', bikeKm: '8' }).success).toBe(false);
    expect(wod2RowSchema.safeParse({ teamId: 't1', runKm: '1,2', bikeKm: '8' }).success).toBe(false);
    expect(wod2RowSchema.safeParse({ teamId: 't1', runKm: '0,7', bikeKm: '8' }).success).toBe(false);
  });

  it('aceita corrida em múltiplos de 500 m', () => {
    for (const valor of ['0,5', '1', '1,5', '3,5', '0']) {
      expect(wod2RowSchema.safeParse({ teamId: 't1', runKm: valor, bikeKm: '8' }).success).toBe(
        true,
      );
    }
  });

  // §21 — MM:SS convertido pelo sistema
  it('converte MM:SS em segundos no lançamento do WOD 3', () => {
    const r = wod3RowSchema.parse({ teamId: 't1', time: '14:32', completed: true, volumeCompleted: null });
    expect(r.timeSeconds).toBe(872);
  });

  it('grava o CAP quando a dupla não concluiu', () => {
    const r = wod3RowSchema.parse({ teamId: 't1', time: '', completed: false, volumeCompleted: '300' });
    expect(r.timeSeconds).toBe(1200);
    expect(r.volumeCompleted).toBe(300);
  });

  it('exige tempo válido de quem concluiu', () => {
    expect(wod3RowSchema.safeParse({ teamId: 't1', time: '', completed: true }).success).toBe(false);
    expect(wod3RowSchema.safeParse({ teamId: 't1', time: 'abc', completed: true }).success).toBe(false);
  });

  it('recusa tempo acima do CAP de 20:00', () => {
    expect(wod3RowSchema.safeParse({ teamId: 't1', time: '21:00', completed: true }).success).toBe(
      false,
    );
    expect(wod3RowSchema.safeParse({ teamId: 't1', time: '20:00', completed: true }).success).toBe(
      true,
    );
  });

  it('valida o cadastro da dupla', () => {
    expect(
      teamSchema.safeParse({
        teamNumber: '7',
        teamName: 'Buriti',
        category: 'MASCULINA',
        athlete1: 'Zé',
        athlete2: 'Dan',
        battery: '2',
        status: 'ATIVA',
      }).success,
    ).toBe(true);

    expect(
      teamSchema.safeParse({
        teamNumber: '7',
        teamName: '',
        category: 'MASCULINA',
        battery: '1',
        status: 'ATIVA',
      }).success,
    ).toBe(false);

    // Bateria só pode ser 1 ou 2
    expect(
      teamSchema.safeParse({
        teamNumber: '7',
        teamName: 'X',
        category: 'MISTA',
        battery: '3',
        status: 'ATIVA',
      }).success,
    ).toBe(false);
  });
});
