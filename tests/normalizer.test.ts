import { describe, expect, it } from 'vitest';
import { DEFAULT_ENDPOINT_MAP, loadEndpointMap } from '@/server/tecnofit/endpoint-map';
import {
  asDate,
  asStringArray,
  normalizeAccessEvent,
  normalizeCollection,
  normalizeStudent,
  pickFirst,
} from '@/server/tecnofit/normalizer';

const map = DEFAULT_ENDPOINT_MAP;

/**
 * O normalizer é o que absorve a incerteza sobre o formato real da API
 * Tecnofit. Ele precisa aceitar variação de nomenclatura sem nunca
 * inventar valor que não veio.
 */
describe('asDate', () => {
  it('aceita ISO 8601', () => {
    expect(asDate('2026-09-01T18:42:00Z')?.toISOString()).toBe('2026-09-01T18:42:00.000Z');
  });

  it('aceita formato brasileiro com hora', () => {
    const d = asDate('01/09/2026 18:42');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(1);
    expect(d?.getHours()).toBe(18);
  });

  it('aceita epoch em segundos e em milissegundos', () => {
    expect(asDate(1756750920)?.toISOString()).toBe(asDate(1756750920000)?.toISOString());
  });

  it('devolve undefined para lixo, em vez de uma data inventada', () => {
    expect(asDate('não é data')).toBeUndefined();
    expect(asDate('')).toBeUndefined();
    expect(asDate(null)).toBeUndefined();
  });
});

describe('asStringArray', () => {
  it('aceita array de strings', () => {
    expect(asStringArray(['Futevôlei', 'Tênis'])).toEqual(['Futevôlei', 'Tênis']);
  });

  it('aceita array de objetos com nome', () => {
    expect(asStringArray([{ name: 'CrossFit' }, { nome: 'Beach Tennis' }])).toEqual([
      'CrossFit',
      'Beach Tennis',
    ]);
  });

  it('aceita string separada por vírgula', () => {
    expect(asStringArray('Futevôlei, Tênis')).toEqual(['Futevôlei', 'Tênis']);
  });

  it('devolve undefined para vazio', () => {
    expect(asStringArray([])).toBeUndefined();
    expect(asStringArray('')).toBeUndefined();
  });
});

describe('pickFirst', () => {
  it('usa o primeiro caminho com valor', () => {
    expect(pickFirst({ b: 'x' }, ['a', 'b', 'c'])).toBe('x');
  });

  it('atravessa caminho com ponto', () => {
    expect(pickFirst({ plan: { name: 'Infinity' } }, ['plan.name'])).toBe('Infinity');
  });

  it('ignora string vazia e segue procurando', () => {
    expect(pickFirst({ a: '', b: 'ok' }, ['a', 'b'])).toBe('ok');
  });
});

describe('normalizeStudent', () => {
  it('normaliza snake_case', () => {
    const s = normalizeStudent(
      { id: '77', full_name: 'João Silva', status: 'ativo', plan_name: 'Nação Infinity' },
      map,
    );
    expect(s?.externalId).toBe('77');
    expect(s?.fullName).toBe('João Silva');
    expect(s?.status).toBe('ACTIVE');
    expect(s?.planName).toBe('Nação Infinity');
  });

  it('deriva o primeiro nome quando a API não fornece', () => {
    expect(normalizeStudent({ id: '1', name: 'Mariana Costa' }, map)?.firstName).toBe('Mariana');
  });

  it('descarta registro sem id ou sem nome', () => {
    expect(normalizeStudent({ name: 'Sem ID' }, map)).toBeNull();
    expect(normalizeStudent({ id: '9' }, map)).toBeNull();
  });

  it('marca status desconhecido em vez de assumir ativo', () => {
    expect(normalizeStudent({ id: '1', name: 'X', status: 'coisa-estranha' }, map)?.status).toBe(
      'UNKNOWN',
    );
  });

  it('deixa modalidades vazias quando a API não informa', () => {
    expect(normalizeStudent({ id: '1', name: 'X' }, map)?.modalities).toEqual([]);
  });
});

describe('normalizeAccessEvent', () => {
  it('normaliza um evento completo', () => {
    const e = normalizeAccessEvent(
      {
        id: 'EVT-1',
        student_id: 'STU-1',
        access_point_id: 'AP-3',
        type: 'entrada',
        occurred_at: '2026-09-01T18:42:00Z',
      },
      map,
    );
    expect(e?.externalEventId).toBe('EVT-1');
    expect(e?.eventType).toBe('ENTRY');
    expect(e?.studentExternalId).toBe('STU-1');
  });

  it('descarta evento sem aluno ou sem horário', () => {
    expect(normalizeAccessEvent({ id: '1', occurred_at: '2026-09-01T18:42:00Z' }, map)).toBeNull();
    expect(normalizeAccessEvent({ student_id: 'S1' }, map)).toBeNull();
  });

  it('assume ENTRY quando o tipo não é declarado', () => {
    // Um giro de catraca sem tipo é, na prática, uma entrada — e entrada
    // é o gatilho do produto.
    const e = normalizeAccessEvent({ student_id: 'S1', occurred_at: '2026-09-01T18:42:00Z' }, map);
    expect(e?.eventType).toBe('ENTRY');
  });
});

describe('normalizeCollection', () => {
  it('encontra a lista em envelopes diferentes', () => {
    for (const body of [
      { data: [{ id: '1', name: 'A' }] },
      { items: [{ id: '1', name: 'A' }] },
      { results: [{ id: '1', name: 'A' }] },
      [{ id: '1', name: 'A' }],
    ]) {
      const page = normalizeCollection(body, map, (raw) => normalizeStudent(raw, map));
      expect(page.items).toHaveLength(1);
    }
  });

  it('descarta itens inválidos sem derrubar o lote', () => {
    const page = normalizeCollection(
      { data: [{ id: '1', name: 'Válido' }, { name: 'Sem id' }, null] },
      map,
      (raw) => normalizeStudent(raw, map),
    );
    expect(page.items).toHaveLength(1);
  });

  it('extrai o cursor da próxima página', () => {
    const page = normalizeCollection({ data: [], next_cursor: 'abc' }, map, () => null);
    expect(page.nextCursor).toBe('abc');
  });
});

describe('loadEndpointMap', () => {
  it('não configura nenhum path por padrão — nada é inventado', () => {
    const m = loadEndpointMap(undefined);
    expect(m.paths.listAccessEvents.path).toBe('');
    expect(m.paths.getStudent.path).toBe('');
  });

  it('aceita override por variável de ambiente sem perder o mapa de campos', () => {
    const m = loadEndpointMap(JSON.stringify({ paths: { listAccessEvents: { path: 'v1/acessos', method: 'GET' } } }));
    expect(m.paths.listAccessEvents.path).toBe('v1/acessos');
    expect(m.fields.student.externalId).toContain('id');
  });

  it('rejeita JSON inválido em vez de seguir com config quebrada', () => {
    expect(() => loadEndpointMap('{ nao é json')).toThrow();
  });
});
