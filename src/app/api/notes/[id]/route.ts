import { z } from 'zod';
import { NoteCategory } from '@prisma/client';
import { requestMeta } from '@/server/auth/session';
import { NOTE_MAX_LENGTH, RelationshipService } from '@/server/services/relationship-service';
import { fail, ok, withAuth } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  category: z.nativeEnum(NoteCategory).optional(),
  content: z.string().trim().min(3).max(NOTE_MAX_LENGTH).optional(),
});

/** A permissão fica no service: ele sabe se a nota é do próprio autor. */
export const PATCH = withAuth(async (user, request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);

  const note = await RelationshipService.updateNote(user, id, parsed.data, await requestMeta());
  return ok({ note: { id: note.id, category: note.category, content: note.content } });
});

export const DELETE = withAuth(async (user, _request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await RelationshipService.deleteNote(user, id, await requestMeta());
  return ok({ success: true });
});
