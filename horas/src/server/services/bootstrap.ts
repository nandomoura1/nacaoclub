import type { ActivityKind } from '@prisma/client';
import type { Tx } from '@/server/db';
import { syncPermissionCatalog } from './rbac-catalog';
import { ensureOfficialHolidays } from './holiday-service';

/**
 * Estrutura inicial da Nação — idempotente, SEM dados de demonstração.
 * Serve tanto para o seed de demo quanto para montar a produção.
 * Tudo aqui é editável depois no admin: é ponto de partida, não regra.
 */
export const AREAS = [
  { name: 'Nação Fit', color: '#022B57' },
  { name: 'CrossFit', color: '#0169E9' },
  { name: 'Aulas Coletivas', color: '#3A86FF' },
  { name: 'Futevôlei', color: '#20C4FA' },
  { name: 'Lutas', color: '#7C3AED' },
  { name: 'Contraturno / Kids', color: '#F59E0B' },
];

/** Modalidade → área (docs/05 §5). Cores com contraste AA sobre branco. */
export const MODALITIES: { name: string; area: string; color: string; duration?: number }[] = [
  { name: 'Musculação', area: 'Nação Fit', color: '#022B57' },
  { name: 'CrossFit', area: 'CrossFit', color: '#0169E9' },
  { name: 'HYROX', area: 'Aulas Coletivas', color: '#B45309' },
  { name: 'Funcional', area: 'Aulas Coletivas', color: '#15803D' },
  { name: 'GAP', area: 'Aulas Coletivas', color: '#BE185D' },
  { name: 'Fit Dance', area: 'Aulas Coletivas', color: '#9333EA' },
  { name: 'Mobilidade', area: 'Aulas Coletivas', color: '#0E7490', duration: 30 },
  { name: 'Funcional Beach', area: 'Aulas Coletivas', color: '#CA8A04' },
  { name: 'Core', area: 'Aulas Coletivas', color: '#4F46E5' },
  { name: 'Futevôlei', area: 'Futevôlei', color: '#0284C7' },
  { name: 'Base Forte', area: 'Futevôlei', color: '#0369A1' },
  { name: 'Saque e Entra', area: 'Futevôlei', color: '#0891B2' },
  { name: 'Muay Thai', area: 'Lutas', color: '#B91C1C' },
  { name: 'Boxe', area: 'Lutas', color: '#9F1239' },
  { name: 'Jiu-Jitsu', area: 'Lutas', color: '#7C3AED' },
  { name: 'Judô', area: 'Lutas', color: '#6D28D9' },
  { name: 'Natação Kids', area: 'Contraturno / Kids', color: '#0EA5E9' },
  { name: 'Funcional Kids', area: 'Contraturno / Kids', color: '#16A34A' },
  { name: 'Futebol Kids', area: 'Contraturno / Kids', color: '#65A30D' },
  { name: 'Vôlei Kids', area: 'Contraturno / Kids', color: '#D97706' },
];

export const ACTIVITY_TYPES: { name: string; kind: ActivityKind; countsHours: boolean }[] = [
  { name: 'Aula', kind: 'AULA', countsHours: true },
  { name: 'Plantão', kind: 'PLANTAO', countsHours: true },
  { name: 'Coordenação', kind: 'COORDENACAO', countsHours: true },
  { name: 'Reunião', kind: 'REUNIAO', countsHours: true },
  { name: 'Curso', kind: 'CURSO', countsHours: true },
  { name: 'Evento / Aulão', kind: 'EVENTO', countsHours: true },
  { name: 'Personal', kind: 'PERSONAL', countsHours: false },
];

export const SPACES = [
  'CrossFit 1', 'CrossFit 2', 'Funcional 1', 'Funcional 2', 'Sala Tatame',
  'Sala de Musculação', 'Piscina',
  'Quadra 1', 'Quadra 2', 'Quadra 3', 'Quadra 4', 'Quadra 5', 'Quadra 6',
];

export const CANCELLATION_REASONS = [
  { name: 'Falta de professor', requiresNote: false },
  { name: 'Feriado', requiresNote: false },
  { name: 'Chuva / condição climática', requiresNote: false },
  { name: 'Sem alunos', requiresNote: false },
  { name: 'Espaço indisponível / manutenção', requiresNote: false },
  { name: 'Evento da Nação', requiresNote: false },
  { name: 'Outro', requiresNote: true },
];

export const POSITIONS = ['Professor', 'Instrutor', 'Estagiário', 'Coordenador', 'Bolsista'];
export const CONTRACT_TYPES = ['CLT', 'MEI / PJ', 'Estágio', 'Horista', 'Bolsista'];

export async function bootstrapStructure(tx: Tx, years: number[] = [2026, 2027]): Promise<void> {
  await tx.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  await syncPermissionCatalog(tx);

  for (const [i, a] of AREAS.entries()) {
    await tx.coordinationArea.upsert({ where: { name: a.name }, create: { ...a, sortOrder: i }, update: {} });
  }
  const areaId = new Map((await tx.coordinationArea.findMany()).map((a) => [a.name, a.id]));

  for (const [i, m] of MODALITIES.entries()) {
    await tx.modality.upsert({
      where: { name: m.name },
      create: { name: m.name, areaId: areaId.get(m.area)!, color: m.color, defaultDurationMin: m.duration ?? 60, sortOrder: i },
      update: {},
    });
  }
  for (const [i, t] of ACTIVITY_TYPES.entries()) {
    await tx.activityType.upsert({ where: { name: t.name }, create: { ...t, sortOrder: i }, update: {} });
  }
  for (const [i, name] of SPACES.entries()) {
    await tx.space.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });
  }
  for (const [i, r] of CANCELLATION_REASONS.entries()) {
    await tx.cancellationReason.upsert({ where: { name: r.name }, create: { ...r, sortOrder: i }, update: {} });
  }
  for (const [i, name] of POSITIONS.entries()) {
    await tx.position.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });
  }
  for (const [i, name] of CONTRACT_TYPES.entries()) {
    await tx.contractType.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });
  }
  for (const year of years) await ensureOfficialHolidays(tx, year);
}
