import type { Alert, AlertSeverity, AlertType, Student } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { logger } from '@/lib/logger';
import { buildAlertDedupeKey, dayBucket } from './dedupe';
import { AccessService } from './access-service';

/**
 * ============================================================
 * MOTOR DE ALERTAS (seções 27 e 28)
 * ============================================================
 *
 * Regras simples, determinísticas e AUDITÁVEIS. Nada de IA no MVP — se o
 * professor não consegue explicar por que o alerta apareceu, o alerta perde
 * a confiança dele e vira ruído.
 *
 * Cada regra é uma função pura de contexto → alerta ou nada. Adicionar uma
 * nova regra é acrescentar um item ao array RULES. Nenhuma delas conhece a
 * interface, e a interface não conhece nenhuma delas.
 */

export interface AlertContext {
  student: Student;
  /** Visitas (dias distintos) nos últimos 7 e 30 dias. */
  last7Days: number;
  last30Days: number;
  weeklyAverage: number;
  lastVisitAt: Date | null;
  /** Dias desde a visita anterior à atual. `null` na primeira visita. */
  daysSincePreviousVisit: number | null;
  totalTrackedEvents: number;
  /** Catraca da entrada que disparou a avaliação. */
  currentTurnstileName: string | null;
  /** Catracas usadas nos últimos 90 dias, antes desta entrada. */
  knownTurnstileNames: string[];
}

export interface AlertDraft {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  guidance?: string;
  /** Janela de deduplicação. Padrão: dia. */
  bucket?: string;
  metadata?: Record<string, unknown>;
}

export type AlertRule = (ctx: AlertContext) => AlertDraft | null;

// ------------------------------------------------------------
// Parâmetros das regras — em um lugar só, fáceis de calibrar
// ------------------------------------------------------------
export const ALERT_THRESHOLDS = {
  /** Abaixo disso o aluno é considerado "novo" para fins de acolhimento. */
  newStudentEventCount: 1,
  /** Dias de ausência que caracterizam retorno. */
  returnAfterDays: 14,
  /** Queda relativa de frequência que dispara atenção. */
  lowFrequencyDropRatio: 0.5,
  /** Só avaliamos queda para quem tinha rotina estabelecida. */
  lowFrequencyMinBaseline: 6,
  /** Dias para o vencimento que disparam aviso. */
  planExpiringDays: 7,
};

const RULES: AlertRule[] = [
  // --- Primeiro acesso de todos ---
  function firstAccess(ctx) {
    if (ctx.totalTrackedEvents > ALERT_THRESHOLDS.newStudentEventCount) return null;
    return {
      type: 'FIRST_ACCESS',
      severity: 'INFO',
      message: 'Primeiro acesso registrado.',
      guidance:
        'Apresente-se pelo nome e pergunte como está sendo a experiência dele na Nação.',
    };
  },

  // --- Aluno recém-matriculado (matrícula recente, ainda que já tenha vindo) ---
  function newStudent(ctx) {
    if (!ctx.student.memberSince) return null;
    const days = Math.floor((Date.now() - ctx.student.memberSince.getTime()) / 86_400_000);
    if (days > 30 || ctx.totalTrackedEvents <= ALERT_THRESHOLDS.newStudentEventCount) return null;
    return {
      type: 'NEW_STUDENT',
      severity: 'INFO',
      message: `Aluno novo — matriculado há ${days} dia${days === 1 ? '' : 's'}.`,
      guidance: 'Confirme se ele já conhece as modalidades incluídas no plano.',
      metadata: { daysSinceEnrollment: days },
    };
  },

  // --- Retorno após ausência ---
  function returnAfterAbsence(ctx) {
    const gap = ctx.daysSincePreviousVisit;
    if (gap === null || gap < ALERT_THRESHOLDS.returnAfterDays) return null;
    return {
      type: 'RETURN_AFTER_ABSENCE',
      severity: 'ATTENTION',
      message: `Retornou após ${gap} dias sem aparecer.`,
      guidance: 'Receba com naturalidade, sem cobrança. Pergunte como ele está e o que mudou na rotina.',
      metadata: { daysAbsent: gap },
    };
  },

  // --- Queda de frequência ---
  function lowFrequency(ctx) {
    // Baseline = ritmo dos últimos 30 dias projetado para 7.
    const baseline = ctx.last30Days;
    if (baseline < ALERT_THRESHOLDS.lowFrequencyMinBaseline) return null;

    const expectedIn7 = (baseline / 30) * 7;
    if (expectedIn7 <= 0) return null;

    const ratio = ctx.last7Days / expectedIn7;
    if (ratio > ALERT_THRESHOLDS.lowFrequencyDropRatio) return null;

    return {
      type: 'LOW_FREQUENCY',
      severity: 'ATTENTION',
      message: `Frequência caiu: ${ctx.last7Days} visita(s) nos últimos 7 dias, contra uma média de ${ctx.weeklyAverage}/semana.`,
      guidance: 'Vale uma conversa leve sobre o que mudou na rotina dele.',
      metadata: { last7Days: ctx.last7Days, weeklyAverage: ctx.weeklyAverage },
    };
  },

  // --- Plano vencido ---
  function planExpired(ctx) {
    const exp = ctx.student.planExpiresAt;
    if (!exp) return null;
    const days = Math.floor((exp.getTime() - Date.now()) / 86_400_000);
    if (days >= 0) return null;
    return {
      type: 'PLAN_EXPIRED',
      severity: 'CRITICAL',
      message: `Plano vencido há ${Math.abs(days)} dia(s).`,
      guidance: 'Encaminhe à recepção com cordialidade. Não trate o assunto na área de treino.',
      metadata: { daysOverdue: Math.abs(days) },
    };
  },

  // --- Plano a vencer ---
  function planExpiring(ctx) {
    const exp = ctx.student.planExpiresAt;
    if (!exp) return null;
    const days = Math.floor((exp.getTime() - Date.now()) / 86_400_000);
    if (days < 0 || days > ALERT_THRESHOLDS.planExpiringDays) return null;
    return {
      type: 'PLAN_EXPIRING',
      severity: 'ATTENTION',
      message: days === 0 ? 'Plano vence hoje.' : `Plano vence em ${days} dia(s).`,
      guidance: 'Comente de forma natural e ofereça ajuda com a renovação.',
      metadata: { daysUntilExpiry: days },
    };
  },

  // --- Modalidade diferente da habitual ---
  function newModality(ctx) {
    const current = ctx.currentTurnstileName;
    if (!current || ctx.knownTurnstileNames.length === 0) return null;
    if (ctx.knownTurnstileNames.includes(current)) return null;
    return {
      type: 'NEW_MODALITY',
      severity: 'INFO',
      message: `Primeira vez usando ${current}.`,
      guidance: 'Pergunte o que o trouxe até essa modalidade — pode virar uma nova paixão.',
      metadata: { turnstile: current },
    };
  },
];

export const AlertService = {
  /** Exposto para teste: avalia regras sem tocar no banco. */
  evaluate(ctx: AlertContext): AlertDraft[] {
    return RULES.map((rule) => rule(ctx)).filter((d): d is AlertDraft => d !== null);
  },

  /**
   * Monta o contexto e persiste os alertas gerados por uma entrada.
   * Deduplicação por (aluno, tipo, janela) evita repetir o mesmo aviso
   * a cada giro de catraca no mesmo dia.
   */
  async evaluateForArrival(params: {
    student: Student;
    currentTurnstileName: string | null;
    occurredAt: Date;
  }): Promise<Alert[]> {
    const { student, currentTurnstileName } = params;

    const freq = await AccessService.frequency(student.id);

    // Visita anterior = último dia distinto antes de hoje.
    const previous = await prisma.accessEvent.findFirst({
      where: {
        studentId: student.id,
        eventType: 'ENTRY',
        occurredAt: { lt: startOfDay(params.occurredAt) },
      },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });

    const daysSincePreviousVisit = previous
      ? Math.floor((startOfDay(params.occurredAt).getTime() - startOfDay(previous.occurredAt).getTime()) / 86_400_000)
      : null;

    const knownTurnstileNames = freq.byTurnstile
      .map((t) => t.name)
      .filter((n) => n !== currentTurnstileName || freq.byTurnstile.find((t) => t.name === n)!.count > 1);

    const ctx: AlertContext = {
      student,
      last7Days: freq.last7Days,
      last30Days: freq.last30Days,
      weeklyAverage: freq.weeklyAverage,
      lastVisitAt: freq.lastVisitAt,
      daysSincePreviousVisit,
      totalTrackedEvents: freq.totalTracked,
      currentTurnstileName,
      knownTurnstileNames,
    };

    const drafts = this.evaluate(ctx);
    const created: Alert[] = [];

    for (const draft of drafts) {
      const dedupeKey = buildAlertDedupeKey(
        student.id,
        draft.type,
        draft.bucket ?? dayBucket(params.occurredAt),
      );

      try {
        // createMany + skipDuplicates evita corrida entre webhook e poller
        // processando a mesma entrada ao mesmo tempo.
        const result = await prisma.alert.createMany({
          data: [{
            studentId: student.id,
            type: draft.type,
            severity: draft.severity,
            message: draft.message,
            guidance: draft.guidance ?? null,
            dedupeKey,
            metadata: (draft.metadata ?? null) as never,
          }],
          skipDuplicates: true,
        });
        if (result.count > 0) {
          const alert = await prisma.alert.findUnique({ where: { dedupeKey } });
          if (alert) created.push(alert);
        }
      } catch (err) {
        logger.error('Falha ao criar alerta', { type: draft.type, error: (err as Error).message });
      }
    }

    if (created.length) {
      logger.info('Alertas gerados', { studentId: student.id, types: created.map((a) => a.type) });
    }
    return created;
  },

  async listForStudent(studentId: string): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: { studentId, resolvedAt: null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
  },

  async listOpen(limit = 50): Promise<(Alert & { student: Student })[]> {
    return prisma.alert.findMany({
      where: { resolvedAt: null, acknowledgedAt: null },
      include: { student: true },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },

  async acknowledge(alertId: string, userId: string): Promise<Alert> {
    return prisma.alert.update({
      where: { id: alertId },
      data: { acknowledgedAt: new Date(), acknowledgedById: userId },
    });
  },
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
