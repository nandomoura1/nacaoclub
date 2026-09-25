import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '@/server/db';
import { audit } from '@/server/audit';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import type { RequestMeta } from '@/server/auth/session';
import { AppError, NotFoundError } from '@/server/errors';
import { ACTIVITY_KINDS, CATALOGS, type CatalogDef, type CatalogKey, type FieldDef } from '@/shared/catalogs';

type Row = Record<string, unknown> & { id: string; name: string };

/** Interface mínima comum aos delegates do Prisma usados pelos cadastros. */
interface Delegate {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
}

function delegate(db: Tx, def: CatalogDef): Delegate {
  return (db as unknown as Record<string, Delegate>)[def.model]!;
}

const HAS_SORT = new Set(['modality', 'activityType', 'space', 'cancellationReason', 'coordinationArea', 'position', 'contractType']);

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  switch (f.type) {
    case 'checkbox':
      return z.boolean();
    case 'number': {
      let n = z.coerce.number({ invalid_type_error: `${f.label}: informe um número.` }).int(`${f.label}: número inteiro.`);
      if (f.min !== undefined) n = n.min(f.min, `${f.label}: mínimo ${f.min}.`);
      if (f.max !== undefined) n = n.max(f.max, `${f.label}: máximo ${f.max}.`);
      return n;
    }
    case 'color':
      return z.string().regex(/^#[0-9a-fA-F]{6}$/, `${f.label}: cor inválida.`);
    case 'select':
      if (f.options === 'activityKinds') {
        return z.enum(ACTIVITY_KINDS.map((k) => k.value) as [string, ...string[]], {
          errorMap: () => ({ message: `${f.label}: escolha uma opção.` }),
        });
      }
      return f.required
        ? z.string().uuid(`${f.label}: escolha uma opção.`)
        : z.string().uuid().nullable().or(z.literal('').transform(() => null));
    case 'text':
    default: {
      const t = z.string().trim().max(120, `${f.label}: no máximo 120 caracteres.`);
      return f.required
        ? t.min(1, `${f.label}: obrigatório.`)
        : t.transform((v) => (v === '' ? null : v)).nullable();
    }
  }
}

export function catalogSchema(def: CatalogDef) {
  return z.object(Object.fromEntries(def.fields.map((f) => [f.key, fieldSchema(f)])));
}

export async function listCatalog(principal: Principal | null, key: CatalogKey) {
  assertCan(principal, 'admin.catalog');
  const def = CATALOGS[key];
  const orderBy = HAS_SORT.has(def.model) ? [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] : [{ active: 'desc' }, { name: 'asc' }];
  const where = def.model === 'coordinationArea' ? { deletedAt: null } : {};
  return delegate(prisma, def).findMany({ where, orderBy });
}

/** Opções dos selects (áreas, centros de custo) — leitura para quem edita cadastros. */
export async function catalogOptions(principal: Principal | null) {
  assertCan(principal, 'admin.catalog');
  const [areas, costCenters] = await Promise.all([
    prisma.coordinationArea.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.costCenter.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return {
    areas: areas.map((a) => ({ value: a.id, label: a.name, inactive: !a.active })),
    costCenters: costCenters.map((c) => ({ value: c.id, label: c.code ? `${c.code} · ${c.name}` : c.name, inactive: !c.active })),
    activityKinds: ACTIVITY_KINDS.map((k) => ({ value: k.value, label: k.label, inactive: false })),
  };
}

function pick(row: Row | null, def: CatalogDef) {
  if (!row) return null;
  return Object.fromEntries(def.fields.map((f) => [f.key, row[f.key] ?? null]));
}

/** Cria (id ausente) ou atualiza um item de cadastro. Nada é apagado: desativa-se. */
export async function saveCatalogItem(
  principal: Principal | null,
  key: CatalogKey,
  id: string | null,
  input: unknown,
  meta: RequestMeta,
): Promise<string> {
  assertCan(principal, 'admin.catalog');
  const def = CATALOGS[key];
  const parsed = catalogSchema(def).safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data as Record<string, unknown>;

  try {
    return await prisma.$transaction(async (tx) => {
      const d = delegate(tx, def);
      const before = id ? await d.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError();

      const row = id ? await d.update({ where: { id }, data }) : await d.create({ data });

      await audit(tx, { actorId: principal.id, ...meta }, {
        action: id ? 'catalog.updated' : 'catalog.created',
        entityType: def.model,
        entityId: row.id,
        before: pick(before, def),
        after: pick(row, def),
        summary: id
          ? `${principal.name} alterou ${def.singular} ${row.name}`
          : `${principal.name} cadastrou ${def.singular} ${row.name}`,
      });
      return row.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(`Já existe ${def.singular} com este nome ou código.`);
    }
    throw err;
  }
}
