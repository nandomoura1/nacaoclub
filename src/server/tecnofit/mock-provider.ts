import type {
  ListAccessEventsParams,
  Page,
  TecnofitAccessEvent,
  TecnofitAccessPoint,
  TecnofitProvider,
  TecnofitStudent,
} from './types';

/**
 * Provider de desenvolvimento.
 *
 * Existe por um motivo específico: permitir que TODO o restante do sistema
 * (ingestão, deduplicação, alertas, realtime, UI) seja construído e testado
 * enquanto as credenciais e a documentação oficial da Tecnofit não estão
 * disponíveis.
 *
 * ⚠️ Todos os dados aqui são FICTÍCIOS. Nenhum aluno real, nenhum ID real.
 * Os identificadores usam o prefixo `MOCK-` justamente para que um dado de
 * mock jamais possa ser confundido com um dado do Tecnofit em produção.
 */

const FIRST = ['João', 'Mariana', 'Pedro', 'Ana', 'Lucas', 'Beatriz', 'Rafael', 'Camila', 'Thiago', 'Juliana', 'Gustavo', 'Larissa'];
const LAST = ['Silva', 'Costa', 'Almeida', 'Ferreira', 'Ribeiro', 'Martins', 'Carvalho', 'Nogueira', 'Barbosa', 'Teixeira'];
const PLANS = ['Nação Infinity', 'Nação Plus', 'Nação Essencial', 'Nação Kids'];
const MODALITIES = ['Futevôlei', 'Nação Fit', 'CrossFit', 'Beach Tennis', 'Tênis', 'Futebol', 'Funcional', 'Nação Kids'];

const ACCESS_POINTS: TecnofitAccessPoint[] = [
  { externalId: 'MOCK-AP-01', name: 'Catraca Principal', location: 'Recepção', active: true },
  { externalId: 'MOCK-AP-02', name: 'Catraca Nação Fit', location: 'Academia', active: true },
  { externalId: 'MOCK-AP-03', name: 'Catraca Futevôlei', location: 'Arena de Areia', active: true },
  { externalId: 'MOCK-AP-04', name: 'Catraca Beach Tennis', location: 'Arena de Areia', active: true },
  { externalId: 'MOCK-AP-05', name: 'Catraca Tênis', location: 'Quadras', active: true },
  { externalId: 'MOCK-AP-06', name: 'Catraca Kids', location: 'Nação Kids', active: true },
];

/** Gerador determinístico: mesma seed, mesmo aluno. Facilita depuração. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildStudent(index: number): TecnofitStudent {
  const rnd = seeded(index * 7919 + 13);
  const first = FIRST[Math.floor(rnd() * FIRST.length)]!;
  const last = LAST[Math.floor(rnd() * LAST.length)]!;
  const fullName = `${first} ${last}`;

  const modalityCount = 1 + Math.floor(rnd() * 2);
  const modalities: string[] = [];
  while (modalities.length < modalityCount) {
    const m = MODALITIES[Math.floor(rnd() * MODALITIES.length)]!;
    if (!modalities.includes(m)) modalities.push(m);
  }

  const monthsAsMember = 1 + Math.floor(rnd() * 40);
  const memberSince = new Date();
  memberSince.setMonth(memberSince.getMonth() - monthsAsMember);

  const planExpiresAt = new Date();
  planExpiresAt.setDate(planExpiresAt.getDate() + Math.floor(rnd() * 120) - 10);

  return {
    externalId: `MOCK-STU-${String(index).padStart(4, '0')}`,
    fullName,
    firstName: first,
    // Sem foto: exercita o caminho de fallback com iniciais na UI.
    photoUrl: undefined,
    status: 'ACTIVE',
    planName: PLANS[Math.floor(rnd() * PLANS.length)]!,
    modalities,
    memberSince,
    planExpiresAt,
  };
}

const STUDENT_COUNT = 60;
const STUDENTS: TecnofitStudent[] = Array.from({ length: STUDENT_COUNT }, (_, i) => buildStudent(i + 1));

/**
 * Eventos são gerados sob demanda a partir do relógio, o que faz o poller
 * enxergar entradas novas a cada ciclo — exatamente como aconteceria com a
 * catraca real. Cada evento recebe um ID estável derivado do minuto de
 * ocorrência, o que também exercita a deduplicação de verdade.
 */
function generateEventsBetween(since: Date, until: Date): TecnofitAccessEvent[] {
  const events: TecnofitAccessEvent[] = [];
  const startMinute = Math.floor(since.getTime() / 60_000);
  const endMinute = Math.floor(until.getTime() / 60_000);

  for (let minute = startMinute; minute <= endMinute; minute++) {
    const rnd = seeded(minute);
    // Nem todo minuto tem entrada — cerca de 45% deles.
    if (rnd() > 0.45) continue;

    const student = STUDENTS[Math.floor(rnd() * STUDENTS.length)]!;
    const ap = ACCESS_POINTS[Math.floor(rnd() * ACCESS_POINTS.length)]!;
    const occurredAt = new Date(minute * 60_000 + Math.floor(rnd() * 60_000));
    if (occurredAt < since || occurredAt > until) continue;

    events.push({
      externalEventId: `MOCK-EVT-${minute}`,
      studentExternalId: student.externalId,
      accessPointExternalId: ap.externalId,
      accessPointLabel: ap.name,
      eventType: 'ENTRY',
      occurredAt,
    });
  }

  return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export class MockTecnofitProvider implements TecnofitProvider {
  readonly name = 'mock' as const;

  async healthCheck() {
    return {
      ok: true,
      detail: 'Provider MOCK ativo — dados fictícios. Nenhuma chamada externa é feita.',
    };
  }

  async listAccessPoints(): Promise<TecnofitAccessPoint[]> {
    return ACCESS_POINTS.map((ap) => ({ ...ap }));
  }

  async listAccessEvents(params: ListAccessEventsParams): Promise<Page<TecnofitAccessEvent>> {
    const until = params.until ?? new Date();
    // Sem cursor inicial, olhamos as últimas 4 horas — suficiente para
    // popular o dashboard na primeira execução sem varrer o histórico.
    const since = params.since ?? new Date(until.getTime() - 4 * 60 * 60 * 1000);
    const items = generateEventsBetween(since, until).slice(0, params.limit ?? 100);
    return { items };
  }

  async getStudent(externalId: string): Promise<TecnofitStudent | null> {
    return STUDENTS.find((s) => s.externalId === externalId) ?? null;
  }

  async searchStudents(query: string, limit = 20): Promise<TecnofitStudent[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return STUDENTS.filter(
      (s) => s.fullName.toLowerCase().includes(q) || s.externalId.toLowerCase().includes(q),
    ).slice(0, limit);
  }
}
