import { z } from 'zod';
import { NoteCategory } from '@prisma/client';
import { assertCan } from '@/server/auth/rbac';
import { requestMeta } from '@/server/auth/session';
import { NOTE_MAX_LENGTH, RelationshipService } from '@/server/services/relationship-service';
import { fail, ok, withAuth } from '@/lib/api';

const schema = z.object({
  studentId: z.string().min(1),
  category: z.nativeEnum(NoteCategory),
  content: z
    .string()
    .trim()
    .min(3, 'Escreva ao menos uma frase.')
    .max(NOTE_MAX_LENGTH, `A nota deve ter no máximo ${NOTE_MAX_LENGTH} caracteres.`),
});

export const POST = withAuth(async (user, request: Request) => {
  assertCan(user, 'note:create');

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);

  const note = await RelationshipService.createNote(user, parsed.data, await requestMeta());

  return ok(
    {
      note: {
        id: note.id,
        category: note.category,
        content: note.content,
        author: note.author.name,
        at: note.createdAt.toISOString(),
      },
    },
    201,
  );
});
