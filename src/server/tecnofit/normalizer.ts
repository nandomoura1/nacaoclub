import type { EndpointMap } from './endpoint-map';
import type {
  Page,
  TecnofitAccessEvent,
  TecnofitAccessEventType,
  TecnofitAccessPoint,
  TecnofitStudent,
  TecnofitStudentStatus,
} from './types';

type Raw = Record<string, unknown>;

/** Lê `a.b.c` num objeto desconhecido sem estourar em nulo. */
export function pick(source: unknown, path: string): unknown {
  if (source === null || typeof source !== 'object') return undefined;
  let cur: unknown = source;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Raw)[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Primeiro caminho que devolve valor útil vence. */
export function pickFirst(source: unknown, paths: string[] | undefined): unknown {
  if (!paths) return undefined;
  for (const p of paths) {
    const v = pick(source, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return undefined;
}

export function asBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    if (['true', '1', 'sim', 'yes', 'ativo'].includes(s)) return true;
    if (['false', '0', 'nao', 'não', 'no', 'inativo'].includes(s)) return false;
  }
  return undefined;
}

/**
 * Converte data em formatos plausíveis. Aceita ISO, epoch (s e ms) e
 * `DD/MM/YYYY [HH:mm[:ss]]`, comum em APIs brasileiras.
 * Retorna `undefined` — nunca uma data inventada — quando não reconhece.
 */
export function asDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;

  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = br;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  if (/^\d+$/.test(s)) return asDate(Number(s));

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v
      .map((item) =>
        typeof item === 'string'
          ? item
          : asString(pick(item, 'name')) ?? asString(pick(item, 'nome')) ?? asString(pick(item, 'label')),
      )
      .filter((x): x is string => Boolean(x && x.trim()))
      .map((x) => x.trim());
    return out.length ? out : undefined;
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
  }
  return undefined;
}

function mapValue<T extends string>(
  raw: unknown,
  table: Record<string, T>,
  fallback: T,
): T {
  const s = asString(raw)?.toLowerCase();
  if (!s) return fallback;
  return table[s] ?? fallback;
}

/** Deriva o primeiro nome só quando a API não fornece um. Puro corte de string. */
function deriveFirstName(fullName: string): string | undefined {
  const first = fullName.trim().split(/\s+/)[0];
  return first || undefined;
}

export function normalizeStudent(raw: unknown, map: EndpointMap): TecnofitStudent | null {
  const f = map.fields.student;
  const externalId = asString(pickFirst(raw, f.externalId));
  const fullName = asString(pickFirst(raw, f.fullName));

  // Sem identificador ou sem nome não há aluno utilizável. Descartar é
  // preferível a criar um registro fantasma.
  if (!externalId || !fullName) return null;

  const modalities = asStringArray(pickFirst(raw, f.modalities));

  return {
    externalId,
    fullName,
    firstName: asString(pickFirst(raw, f.firstName)) ?? deriveFirstName(fullName),
    photoUrl: asString(pickFirst(raw, f.photoUrl)),
    status: mapValue<TecnofitStudentStatus>(
      pickFirst(raw, f.status),
      map.valueMaps.studentStatus,
      'UNKNOWN',
    ),
    planName: asString(pickFirst(raw, f.planName)),
    modalities: modalities ?? [],
    memberSince: asDate(pickFirst(raw, f.memberSince)),
    planExpiresAt: asDate(pickFirst(raw, f.planExpiresAt)),
    raw: (raw && typeof raw === 'object' ? (raw as Raw) : undefined),
  };
}

export function normalizeAccessPoint(raw: unknown, map: EndpointMap): TecnofitAccessPoint | null {
  const f = map.fields.accessPoint;
  const externalId = asString(pickFirst(raw, f.externalId));
  if (!externalId) return null;

  return {
    externalId,
    // Sem nome legível, usamos o próprio ID — explícito, não inventado.
    name: asString(pickFirst(raw, f.name)) ?? `Catraca ${externalId}`,
    description: asString(pickFirst(raw, f.description)),
    location: asString(pickFirst(raw, f.location)),
    active: asBoolean(pickFirst(raw, f.active)) ?? true,
    raw: (raw && typeof raw === 'object' ? (raw as Raw) : undefined),
  };
}

export function normalizeAccessEvent(raw: unknown, map: EndpointMap): TecnofitAccessEvent | null {
  const f = map.fields.accessEvent;
  const studentExternalId = asString(pickFirst(raw, f.studentExternalId));
  const occurredAt = asDate(pickFirst(raw, f.occurredAt));

  // Um evento sem aluno ou sem horário não serve para nada no produto:
  // não dá para dizer quem chegou nem quando. Descartar e registrar.
  if (!studentExternalId || !occurredAt) return null;

  return {
    externalEventId: asString(pickFirst(raw, f.externalEventId)),
    studentExternalId,
    accessPointExternalId: asString(pickFirst(raw, f.accessPointExternalId)),
    accessPointLabel: asString(pickFirst(raw, f.accessPointLabel)),
    eventType: mapValue<TecnofitAccessEventType>(
      pickFirst(raw, f.eventType),
      map.valueMaps.accessEventType,
      // Um evento de catraca sem tipo declarado é, na prática, uma entrada.
      // Assumimos ENTRY porque é o gatilho do produto, e marcamos no raw.
      'ENTRY',
    ),
    occurredAt,
    raw: (raw && typeof raw === 'object' ? (raw as Raw) : undefined),
  };
}

/**
 * Extrai a coleção de um envelope de resposta desconhecido.
 * Também aceita array puro na raiz.
 */
export function normalizeCollection<T>(
  body: unknown,
  map: EndpointMap,
  normalizeItem: (raw: unknown) => T | null,
): Page<T> {
  let rawItems: unknown = Array.isArray(body) ? body : undefined;

  if (!rawItems) {
    for (const p of map.collection.itemsPath) {
      const candidate = pick(body, p);
      if (Array.isArray(candidate)) {
        rawItems = candidate;
        break;
      }
    }
  }

  const items = Array.isArray(rawItems)
    ? rawItems.map(normalizeItem).filter((x): x is T => x !== null)
    : [];

  const nextCursor = asString(pickFirst(body, map.collection.nextCursorPath));
  return { items, ...(nextCursor ? { nextCursor } : {}) };
}
