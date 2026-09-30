import { describe, expect, it } from 'vitest';
import { dayInPlan, horizon, normalizePlan, programRequestSchema, trainingDates, type ProgramPlan } from '@/domain/programming/ai-program';

describe('planilha da IA', () => {
  it('datas de aula no período, só nos dias escolhidos', () => {
    const req = programRequestSchema.parse({ kind: 'continuidade', startDate: '2026-10-05', length: 2, unit: 'semanas', weekdays: [1, 3, 5] });
    expect(trainingDates(req)).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16']);
    expect(trainingDates({ ...req, length: 3, unit: 'dias', weekdays: [1, 2, 3, 4, 5, 6] })).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('prazo: curto até 2 semanas, médio até 6, longo acima', () => {
    expect(horizon({ length: 10, unit: 'dias' })).toBe('curto');
    expect(horizon({ length: 4, unit: 'semanas' })).toBe('medio');
    expect(horizon({ length: 8, unit: 'semanas' })).toBe('longo');
  });

  it('pedido: limites e janela 14/30', () => {
    expect(programRequestSchema.safeParse({ kind: 'periodizacao', startDate: '2026-10-05', length: 13, unit: 'semanas', weekdays: [1] }).success).toBe(false); // 91 dias
    expect(programRequestSchema.safeParse({ kind: 'periodizacao', startDate: '2026-10-05', length: 12, unit: 'semanas', weekdays: [1] }).success).toBe(true);
    expect(programRequestSchema.safeParse({ kind: 'periodizacao', startDate: '2026-10-05', length: 90, unit: 'dias', weekdays: [1] }).success).toBe(false);
    expect(programRequestSchema.safeParse({ kind: 'continuidade', startDate: '2026-10-05', length: 5, unit: 'dias', weekdays: [], window: 14 }).success).toBe(false);
    expect(programRequestSchema.safeParse({ kind: 'continuidade', startDate: '2026-10-05', length: 5, unit: 'dias', weekdays: [1], window: 21 }).success).toBe(false);
  });

  it('estratégia só com as datas pedidas, sem repetir; acha o dia', () => {
    const day = (data: string) => ({ data, tema: 't', forca: '', wod: 'w', intensidade: 'MODERATE' as const });
    const plan: ProgramPlan = {
      titulo: 'x', modelo: 'm', estrategia: 'e', objetivoFinal: 'o', fases: [], testes: [], decisoes: [],
      semanas: [
        { semana: 1, fase: 'A', foco: 'f', volume: 'alto', intensidade: 'moderada', deload: false, dias: [day('2026-10-07'), day('2026-10-05'), day('2026-10-05'), day('2026-10-06')] },
        { semana: 2, fase: 'B', foco: 'f', volume: 'baixo', intensidade: 'alta', deload: true, dias: [day('2026-10-20')] },
      ],
    };
    const n = normalizePlan(plan, ['2026-10-05', '2026-10-07']);
    expect(n.semanas).toHaveLength(1);
    expect(n.semanas[0]!.dias.map((d) => d.data)).toEqual(['2026-10-05', '2026-10-07']);
    expect(dayInPlan(n, '2026-10-07')?.week.fase).toBe('A');
    expect(dayInPlan(n, '2026-10-06')).toBeNull();
  });
});
