import { loadEndpointMap, type EndpointMap } from './endpoint-map';
import { tecnofitRequest } from './http-client';
import {
  normalizeAccessEvent,
  normalizeAccessPoint,
  normalizeCollection,
  normalizeStudent,
} from './normalizer';
import {
  TecnofitError,
  type ListAccessEventsParams,
  type Page,
  type TecnofitAccessEvent,
  type TecnofitAccessPoint,
  type TecnofitProvider,
  type TecnofitStudent,
} from './types';

/**
 * Provider HTTP real.
 *
 * Toda a especificidade da API vive no EndpointMap. Este arquivo só orquestra:
 * chamar, normalizar, devolver. Quando os paths oficiais forem preenchidos,
 * nada aqui precisa mudar.
 */
export class HttpTecnofitProvider implements TecnofitProvider {
  readonly name = 'http' as const;
  private readonly map: EndpointMap;

  constructor(map: EndpointMap = loadEndpointMap()) {
    this.map = map;
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const ep = this.map.paths.healthCheck.path ? this.map.paths.healthCheck : this.map.paths.listAccessPoints;
    if (!ep.path) {
      return {
        ok: false,
        detail:
          'Nenhum endpoint configurado. Preencha o EndpointMap com os paths da documentação oficial Tecnofit.',
      };
    }
    try {
      await tecnofitRequest({ path: ep.path, method: ep.method, query: { [this.map.queryParams.limit]: 1 } });
      return { ok: true, detail: 'Conexão com a API Tecnofit estabelecida.' };
    } catch (err) {
      const e = err as TecnofitError;
      return { ok: false, detail: `${e.kind}: ${e.message}` };
    }
  }

  async listAccessPoints(): Promise<TecnofitAccessPoint[]> {
    const ep = this.map.paths.listAccessPoints;
    const body = await tecnofitRequest({ path: ep.path, method: ep.method }, this.map);
    return normalizeCollection(body, this.map, (raw) => normalizeAccessPoint(raw, this.map)).items;
  }

  async listAccessEvents(params: ListAccessEventsParams): Promise<Page<TecnofitAccessEvent>> {
    const ep = this.map.paths.listAccessEvents;
    const q = this.map.queryParams;
    const body = await tecnofitRequest({
      path: ep.path,
      method: ep.method,
      query: {
        [q.since]: params.since?.toISOString(),
        [q.until]: params.until?.toISOString(),
        [q.cursor]: params.cursor,
        [q.limit]: params.limit ?? 100,
      },
    });
    return normalizeCollection(body, this.map, (raw) => normalizeAccessEvent(raw, this.map));
  }

  async getStudent(externalId: string): Promise<TecnofitStudent | null> {
    const ep = this.map.paths.getStudent;
    if (!ep.path) throw new TecnofitError('Endpoint getStudent não configurado.', 'NOT_CONFIGURED');

    // Suporta path parametrizado (".../students/{id}") e query (".../student?id=").
    const hasPlaceholder = ep.path.includes('{id}');
    try {
      const body = await tecnofitRequest({
        path: hasPlaceholder ? ep.path.replace('{id}', encodeURIComponent(externalId)) : ep.path,
        method: ep.method,
        query: hasPlaceholder ? undefined : { id: externalId },
      });

      // A resposta pode vir como objeto direto ou dentro de um envelope.
      const direct = normalizeStudent(body, this.map);
      if (direct) return direct;
      const page = normalizeCollection(body, this.map, (raw) => normalizeStudent(raw, this.map));
      return page.items[0] ?? null;
    } catch (err) {
      if (err instanceof TecnofitError && err.kind === 'NOT_FOUND') return null;
      throw err;
    }
  }

  async searchStudents(query: string, limit = 20): Promise<TecnofitStudent[]> {
    const ep = this.map.paths.searchStudents;
    const q = this.map.queryParams;
    const body = await tecnofitRequest({
      path: ep.path,
      method: ep.method,
      query: { [q.search]: query, [q.limit]: limit },
    });
    return normalizeCollection(body, this.map, (raw) => normalizeStudent(raw, this.map)).items;
  }
}
