import { describe, expect, it } from 'vitest';
import type { Student } from '@prisma/client';
import { ALERT_THRESHOLDS, AlertService, type AlertContext } from '@/server/services/alert-service';

/**
 * As regras de alerta são determinísticas de propósito (seção 27): o
 * professor precisa entender por que o aviso apareceu. Estes testes são o
 * contrato dessas regras.
 */

function aluno(over: Partial<Student> = {}): Student {
  return {
    id: 'stu-1',
    tecnofitStudentId: 'MOCK-1',
    fullName: 'João Silva',
    firstName: 'João',
    photoUrl: null,
    status: 'ACTIVE',
    planName: 'Nação Infinity',
    modalities: ['Futevôlei'],
    memberSince: new Date(Date.now() - 400 * 86_400_000),
    planExpiresAt: null,
    syncedAt: new Date(),
    rawSnapshot: null,
    firstSeenAt: new Date(Date.now() - 400 * 86_400_000),
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Student;
}

function contexto(over: Partial<AlertContext> = {}): AlertContext {
  return {
    student: aluno(),
    last7Days: 4,
    last30Days: 18,
    weeklyAverage: 4.2,
    lastVisitAt: new Date(),
    daysSincePreviousVisit: 2,
    totalTrackedEvents: 50,
    currentTurnstileName: 'Futevôlei',
    knownTurnstileNames: ['Futevôlei', 'Nação Fit'],
    ...over,
  };
}

const tipos = (ctx: AlertContext) => AlertService.evaluate(ctx).map((a) => a.type);

describe('regra FIRST_ACCESS', () => {
  it('dispara no primeiro acesso registrado', () => {
    expect(tipos(contexto({ totalTrackedEvents: 1 }))).toContain('FIRST_ACCESS');
  });

  it('não dispara para aluno com histórico', () => {
    expect(tipos(contexto({ totalTrackedEvents: 40 }))).not.toContain('FIRST_ACCESS');
  });

  it('traz orientação de abordagem, não só o aviso', () => {
    const alerta = AlertService.evaluate(contexto({ totalTrackedEvents: 1 })).find(
      (a) => a.type === 'FIRST_ACCESS',
    );
    expect(alerta?.guidance).toBeTruthy();
  });
});

describe('regra RETURN_AFTER_ABSENCE', () => {
  it('dispara depois do limiar de ausência', () => {
    const dias = ALERT_THRESHOLDS.returnAfterDays + 6;
    const alertas = AlertService.evaluate(contexto({ daysSincePreviousVisit: dias }));
    const retorno = alertas.find((a) => a.type === 'RETURN_AFTER_ABSENCE');
    expect(retorno).toBeDefined();
    expect(retorno?.message).toContain(String(dias));
  });

  it('não dispara para ausência curta', () => {
    expect(tipos(contexto({ daysSincePreviousVisit: 3 }))).not.toContain('RETURN_AFTER_ABSENCE');
  });

  it('não dispara na primeira visita, que não tem visita anterior', () => {
    expect(tipos(contexto({ daysSincePreviousVisit: null }))).not.toContain('RETURN_AFTER_ABSENCE');
  });
});

describe('regra LOW_FREQUENCY', () => {
  it('dispara quando a semana atual fica muito abaixo do ritmo do mês', () => {
    // 20 visitas em 30 dias projetam ~4,7 na semana; veio 1.
    expect(tipos(contexto({ last30Days: 20, last7Days: 1 }))).toContain('LOW_FREQUENCY');
  });

  it('não dispara para quem mantém o ritmo', () => {
    expect(tipos(contexto({ last30Days: 20, last7Days: 5 }))).not.toContain('LOW_FREQUENCY');
  });

  it('não julga quem ainda não tem rotina estabelecida', () => {
    // Sem baseline suficiente, uma semana fraca não significa nada.
    expect(tipos(contexto({ last30Days: 3, last7Days: 0 }))).not.toContain('LOW_FREQUENCY');
  });
});

describe('regras de plano', () => {
  it('avisa quando o plano está por vencer', () => {
    const em3dias = new Date(Date.now() + 3 * 86_400_000);
    expect(tipos(contexto({ student: aluno({ planExpiresAt: em3dias }) }))).toContain('PLAN_EXPIRING');
  });

  it('marca plano vencido como crítico', () => {
    const ha5dias = new Date(Date.now() - 5 * 86_400_000);
    const alerta = AlertService.evaluate(
      contexto({ student: aluno({ planExpiresAt: ha5dias }) }),
    ).find((a) => a.type === 'PLAN_EXPIRED');
    expect(alerta?.severity).toBe('CRITICAL');
  });

  it('não emite os dois ao mesmo tempo', () => {
    const ha5dias = new Date(Date.now() - 5 * 86_400_000);
    const resultado = tipos(contexto({ student: aluno({ planExpiresAt: ha5dias }) }));
    expect(resultado).toContain('PLAN_EXPIRED');
    expect(resultado).not.toContain('PLAN_EXPIRING');
  });

  it('fica em silêncio quando a API não informa vencimento', () => {
    // Sem dado, sem alerta. Nunca inventar.
    const resultado = tipos(contexto({ student: aluno({ planExpiresAt: null }) }));
    expect(resultado).not.toContain('PLAN_EXPIRING');
    expect(resultado).not.toContain('PLAN_EXPIRED');
  });
});

describe('regra NEW_MODALITY', () => {
  it('dispara ao usar uma catraca inédita', () => {
    expect(
      tipos(contexto({ currentTurnstileName: 'Tênis', knownTurnstileNames: ['Futevôlei'] })),
    ).toContain('NEW_MODALITY');
  });

  it('não dispara para a modalidade habitual', () => {
    expect(
      tipos(contexto({ currentTurnstileName: 'Futevôlei', knownTurnstileNames: ['Futevôlei'] })),
    ).not.toContain('NEW_MODALITY');
  });

  it('não dispara quando não há histórico de comparação', () => {
    expect(
      tipos(contexto({ currentTurnstileName: 'Tênis', knownTurnstileNames: [] })),
    ).not.toContain('NEW_MODALITY');
  });

  it('não dispara quando a catraca não foi identificada', () => {
    expect(
      tipos(contexto({ currentTurnstileName: null, knownTurnstileNames: ['Futevôlei'] })),
    ).not.toContain('NEW_MODALITY');
  });
});

describe('aluno em rotina saudável', () => {
  it('não gera alerta nenhum — silêncio é informação', () => {
    expect(AlertService.evaluate(contexto())).toHaveLength(0);
  });
});
