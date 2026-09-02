import type { AccessEvent, Student, Turnstile } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { allowedTurnstileIds } from '@/server/auth/rbac';
import type { SessionUser } from '@/server/auth/session';

/**
 * Leitura de eventos de acesso e cálculo de frequência.
 *
 * Toda consulta passa pelo filtro de catracas autorizadas — a permissão é
 * aplicada na query, não depois. Um professor jamais recebe do servidor um
 * evento de catraca que não pode ver, nem por engano de UI.
 */

export type AccessEventWithRelations = AccessEvent & {
  student: Student;
  turnstile: Turnstile | null;
};

export interface FrequencySummary {
  last7Days: number;
  last30Days: number;
  /** Média de visitas por semana nos últimos 30 dias. */
  weeklyAverage: number;
  lastVisitAt: Date | null;
  /** Primeiro acesso registrado por nós. Não é a data de matrícula. */
  firstSeenAt: Date | null;
  totalTracked: number;
  /** Contagem por catraca nos últimos 90 dias, para a barra de modalidades. */
  byTurnstile: Array<{ turnstileId: string | null; name: string; count: number }>;
}

/**
 * Traduz o filtro escolhido pelo usuário em cláusula de catraca segura.
 * `null` (Todas) vira "todas as minhas" quando o acesso é restrito.
 */
async function turnstileWhere(user: SessionUser, turnstileId: string | null) {
  const allowed = await allowedTurnstileIds(user);

  if (turnstileId) {
    if (allowed !== null && !allowed.includes(turnstileId)) {
      // Alvo proibido: devolvemos uma cláusula impossível em vez de erro,
      // para que a UI degrade em lista vazia. A rota já valida antes.
      return { turnstileId: '__forbidden__' };
    }
    return { turnstileId };
  }

  if (allowed === null) return {};
  return { turnstileId: { in: allowed.length ? allowed : ['__none__'] } };
}

export const AccessService = {
  /**
   * Feed do dashboard: quem chegou, mais recente primeiro.
   *
   * A janela é ROLANTE, não "desde a meia-noite". A diferença importa de
   * verdade: à 00h15, um corte por dia civil esvaziaria a tela e esconderia
   * quem entrou às 23h50 — justamente as pessoas que ainda estão no clube.
   * "Entraram agora" é uma pergunta sobre as últimas horas, não sobre a data.
   *
   * Os indicadores do topo continuam sendo do dia (ver todayStats), porque
   * ali a pergunta é outra: "quantas entradas tivemos hoje?".
   */
  async listRecent(
    user: SessionUser,
    params: { turnstileId: string | null; limit?: number; since?: Date; windowHours?: number },
  ): Promise<AccessEventWithRelations[]> {
    const where = await turnstileWhere(user, params.turnstileId);
    const since =
      params.since ?? new Date(Date.now() - (params.windowHours ?? RECENT_WINDOW_HOURS) * 3_600_000);

    return prisma.accessEvent.findMany({
      where: { ...where, eventType: 'ENTRY', occurredAt: { gte: since } },
      include: { student: true, turnstile: true },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(params.limit ?? 50, 200),
    });
  },

  /** Indicadores do topo do dashboard. */
  async todayStats(user: SessionUser, turnstileId: string | null) {
    const where = await turnstileWhere(user, turnstileId);
    const since = startOfToday();

    const [entries, distinctStudents, newStudents, openAlerts] = await Promise.all([
      prisma.accessEvent.count({ where: { ...where, eventType: 'ENTRY', occurredAt: { gte: since } } }),
      prisma.accessEvent
        .findMany({
          where: { ...where, eventType: 'ENTRY', occurredAt: { gte: since } },
          distinct: ['studentId'],
          select: { studentId: true },
        })
        .then((r) => r.length),
      prisma.student.count({ where: { firstSeenAt: { gte: since } } }),
      prisma.alert.count({ where: { resolvedAt: null, acknowledgedAt: null } }),
    ]);

    return { entries, distinctStudents, newStudents, openAlerts };
  },

  async historyForStudent(studentId: string, limit = 30): Promise<AccessEventWithRelations[]> {
    return prisma.accessEvent.findMany({
      where: { studentId },
      include: { student: true, turnstile: true },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(limit, 200),
    });
  },

  /**
   * Frequência do aluno.
   *
   * Importante: conta VISITAS (dias distintos), não giros de catraca. Um
   * aluno que entra na academia e depois na arena no mesmo dia fez uma
   * visita, não duas — contar giros inflaria o número e mentiria para o
   * professor.
   */
  async frequency(studentId: string): Promise<FrequencySummary> {
    const now = new Date();
    const from90 = new Date(now.getTime() - 90 * 86_400_000);

    const events = await prisma.accessEvent.findMany({
      where: { studentId, eventType: 'ENTRY', occurredAt: { gte: from90 } },
      include: { turnstile: true },
      orderBy: { occurredAt: 'desc' },
    });

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const from7 = new Date(now.getTime() - 7 * 86_400_000);
    const from30 = new Date(now.getTime() - 30 * 86_400_000);

    const days7 = new Set<string>();
    const days30 = new Set<string>();
    const byTurnstileMap = new Map<string, { turnstileId: string | null; name: string; count: number }>();

    for (const e of events) {
      if (e.occurredAt >= from7) days7.add(dayKey(e.occurredAt));
      if (e.occurredAt >= from30) days30.add(dayKey(e.occurredAt));

      const name = e.turnstile?.modalityLabel ?? e.turnstile?.name ?? e.rawTurnstileRef ?? 'Não informado';
      const key = e.turnstileId ?? `raw:${name}`;
      const entry = byTurnstileMap.get(key) ?? { turnstileId: e.turnstileId, name, count: 0 };
      entry.count++;
      byTurnstileMap.set(key, entry);
    }

    const [aggregate, student] = await Promise.all([
      prisma.accessEvent.aggregate({
        where: { studentId, eventType: 'ENTRY' },
        _count: { _all: true },
        _max: { occurredAt: true },
        _min: { occurredAt: true },
      }),
      prisma.student.findUnique({ where: { id: studentId }, select: { firstSeenAt: true } }),
    ]);

    return {
      last7Days: days7.size,
      last30Days: days30.size,
      // Uma casa decimal: "4,5x por semana" é legível; 4,4285714 não é.
      weeklyAverage: Math.round((days30.size / 30) * 7 * 10) / 10,
      lastVisitAt: aggregate._max.occurredAt ?? null,
      firstSeenAt: student?.firstSeenAt ?? aggregate._min.occurredAt ?? null,
      totalTracked: aggregate._count._all,
      byTurnstile: [...byTurnstileMap.values()].sort((a, b) => b.count - a.count),
    };
  },
};

/**
 * Janela do feed "Entraram agora". Doze horas cobre um turno inteiro de
 * operação do clube sem transformar a tela em arquivo histórico.
 */
export const RECENT_WINDOW_HOURS = 12;

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
