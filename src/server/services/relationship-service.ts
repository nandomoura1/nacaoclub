import type { NoteCategory, RelationshipEvent, RelationshipEventType, RelationshipNote, User } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { AuthorizationError, can } from '@/server/auth/rbac';
import type { SessionUser } from '@/server/auth/session';
import { AuditService } from './audit-service';

/**
 * ============================================================
 * RELACIONAMENTO — a memória operacional da Nação
 * ============================================================
 *
 * O que o Tecnofit não guarda: o contexto humano. "Está treinando para um
 * campeonato", "prefere a turma da manhã", "voltou depois de uma cirurgia".
 *
 * Duas garantias inegociáveis (seções 22 e 23):
 *   1. Autoria e data são imutáveis. A nota pertence a quem escreveu.
 *   2. Nada muda em silêncio. Edição e exclusão geram AuditLog com o valor
 *      anterior, e a exclusão é sempre soft delete.
 */

export const NOTE_MAX_LENGTH = 1000;

/** Rótulos dos feedbacks de um clique (seção 24). */
export const QUICK_FEEDBACKS = [
  { key: 'GREAT_SESSION', type: 'FEEDBACK_POSITIVE', emoji: '👍', label: 'Treino foi ótimo' },
  { key: 'GREAT_EVOLUTION', type: 'EVOLUTION', emoji: '🔥', label: 'Evolução excelente' },
  { key: 'ACHIEVED_GOAL', type: 'ACHIEVEMENT', emoji: '🏆', label: 'Conquistou objetivo' },
  { key: 'TALKED', type: 'CONVERSATION', emoji: '💬', label: 'Conversamos' },
  { key: 'NEEDS_ATTENTION', type: 'ATTENTION', emoji: '⚠️', label: 'Precisa de atenção' },
  { key: 'GREAT_RELATIONSHIP', type: 'FEEDBACK_POSITIVE', emoji: '❤️', label: 'Excelente relacionamento' },
  { key: 'IMPROVING', type: 'EVOLUTION', emoji: '📈', label: 'Evoluindo' },
] as const satisfies ReadonlyArray<{
  key: string;
  type: RelationshipEventType;
  emoji: string;
  label: string;
}>;

export type QuickFeedbackKey = (typeof QUICK_FEEDBACKS)[number]['key'];

export type NoteWithAuthor = RelationshipNote & {
  author: Pick<User, 'id' | 'name' | 'role'>;
};

export type EventWithUser = RelationshipEvent & {
  user: Pick<User, 'id' | 'name' | 'role'>;
};

/** Item unificado da timeline: notas e feedbacks lado a lado, em ordem. */
export type TimelineItem =
  | { kind: 'note'; at: Date; note: NoteWithAuthor }
  | { kind: 'event'; at: Date; event: EventWithUser };

const AUTHOR_SELECT = { id: true, name: true, role: true } as const;

export const RelationshipService = {
  async listNotes(studentId: string, limit = 50): Promise<NoteWithAuthor[]> {
    return prisma.relationshipNote.findMany({
      where: { studentId, deletedAt: null },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async listEvents(studentId: string, limit = 50): Promise<EventWithUser[]> {
    return prisma.relationshipEvent.findMany({
      where: { studentId },
      include: { user: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async timeline(studentId: string, limit = 60): Promise<TimelineItem[]> {
    const [notes, events] = await Promise.all([
      this.listNotes(studentId, limit),
      this.listEvents(studentId, limit),
    ]);

    return [
      ...notes.map((note): TimelineItem => ({ kind: 'note', at: note.createdAt, note })),
      ...events.map((event): TimelineItem => ({ kind: 'event', at: event.createdAt, event })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  },

  async createNote(
    user: SessionUser,
    input: { studentId: string; category: NoteCategory; content: string },
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<NoteWithAuthor> {
    const content = input.content.trim();
    if (!content) throw new Error('A nota não pode ficar vazia.');
    if (content.length > NOTE_MAX_LENGTH) {
      throw new Error(`A nota deve ter no máximo ${NOTE_MAX_LENGTH} caracteres.`);
    }

    const note = await prisma.relationshipNote.create({
      data: {
        studentId: input.studentId,
        authorUserId: user.id,
        category: input.category,
        content,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });

    await AuditService.record({
      userId: user.id,
      action: 'NOTE_CREATE',
      entity: 'RelationshipNote',
      entityId: note.id,
      newValue: { studentId: input.studentId, category: input.category, content },
      ...meta,
    });

    return note;
  },

  /**
   * Edição preserva a autoria original. Quem edita nota de terceiro precisa
   * de `note:update:any` — e a auditoria registra quem foi.
   */
  async updateNote(
    user: SessionUser,
    noteId: string,
    input: { category?: NoteCategory; content?: string },
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<NoteWithAuthor> {
    const before = await prisma.relationshipNote.findUnique({ where: { id: noteId } });
    if (!before || before.deletedAt) throw new Error('Nota não encontrada.');

    const isOwn = before.authorUserId === user.id;
    if (!(isOwn ? can(user, 'note:update:own') : can(user, 'note:update:any'))) {
      throw new AuthorizationError('Você não pode editar esta nota.');
    }

    const content = input.content?.trim();
    if (content !== undefined && content.length === 0) throw new Error('A nota não pode ficar vazia.');
    if (content && content.length > NOTE_MAX_LENGTH) {
      throw new Error(`A nota deve ter no máximo ${NOTE_MAX_LENGTH} caracteres.`);
    }

    const after = await prisma.relationshipNote.update({
      where: { id: noteId },
      data: {
        category: input.category ?? before.category,
        content: content ?? before.content,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });

    await AuditService.record({
      userId: user.id,
      action: 'NOTE_UPDATE',
      entity: 'RelationshipNote',
      entityId: noteId,
      oldValue: { category: before.category, content: before.content },
      newValue: { category: after.category, content: after.content },
      ...meta,
    });

    return after;
  },

  /** Soft delete. O registro nunca sai do banco — a trilha precisa dele. */
  async deleteNote(
    user: SessionUser,
    noteId: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    const before = await prisma.relationshipNote.findUnique({ where: { id: noteId } });
    if (!before || before.deletedAt) throw new Error('Nota não encontrada.');

    const isOwn = before.authorUserId === user.id;
    if (!(isOwn ? can(user, 'note:delete:own') : can(user, 'note:delete:any'))) {
      throw new AuthorizationError('Você não pode excluir esta nota.');
    }

    await prisma.relationshipNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    await AuditService.record({
      userId: user.id,
      action: 'NOTE_DELETE',
      entity: 'RelationshipNote',
      entityId: noteId,
      oldValue: { category: before.category, content: before.content },
      newValue: null,
      ...meta,
    });
  },

  /**
   * Feedback de um clique. A meta é registrar em menos de cinco segundos,
   * então não há formulário: o professor toca e acabou.
   */
  async createQuickFeedback(
    user: SessionUser,
    input: { studentId: string; key: QuickFeedbackKey },
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<EventWithUser> {
    const preset = QUICK_FEEDBACKS.find((f) => f.key === input.key);
    if (!preset) throw new Error('Feedback desconhecido.');

    const event = await prisma.relationshipEvent.create({
      data: {
        studentId: input.studentId,
        userId: user.id,
        type: preset.type,
        label: preset.label,
        metadata: { key: preset.key, emoji: preset.emoji },
      },
      include: { user: { select: AUTHOR_SELECT } },
    });

    await AuditService.record({
      userId: user.id,
      action: 'FEEDBACK_CREATE',
      entity: 'RelationshipEvent',
      entityId: event.id,
      newValue: { studentId: input.studentId, key: preset.key },
      ...meta,
    });

    return event;
  },

  /**
   * Nota mais relevante para o card do dashboard: a mais recente.
   * O card mostra UMA linha — o professor tem dois segundos, não dois minutos.
   */
  async latestNoteFor(studentIds: string[]): Promise<Map<string, NoteWithAuthor>> {
    if (studentIds.length === 0) return new Map();

    const notes = await prisma.relationshipNote.findMany({
      where: { studentId: { in: studentIds }, deletedAt: null },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    const map = new Map<string, NoteWithAuthor>();
    for (const note of notes) {
      if (!map.has(note.studentId)) map.set(note.studentId, note);
    }
    return map;
  },
};

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, { label: string; emoji: string }> = {
  OBJETIVO: { label: 'Objetivo', emoji: '🎯' },
  PREFERENCIA: { label: 'Preferência', emoji: '⭐' },
  TREINAMENTO: { label: 'Treinamento', emoji: '🏋️' },
  RELACIONAMENTO: { label: 'Relacionamento', emoji: '💬' },
  ATENDIMENTO: { label: 'Atendimento', emoji: '🤝' },
  COMERCIAL: { label: 'Comercial', emoji: '📋' },
  EVENTO: { label: 'Evento', emoji: '📅' },
  CONQUISTA: { label: 'Conquista', emoji: '🏆' },
  FEEDBACK: { label: 'Feedback', emoji: '📈' },
  OUTRO: { label: 'Outro', emoji: '📝' },
};
