/**
 * ============================================================
 * MAPA DECLARATIVO DA API TECNOFIT
 * ============================================================
 *
 * ⚠️  ESTADO ATUAL: NÃO VERIFICADO CONTRA A DOCUMENTAÇÃO OFICIAL.
 *
 * A documentação oficial (https://api-externa-tecnofit.readme.io) não pôde
 * ser consultada no ambiente em que este código foi escrito — o proxy de
 * egresso da rede bloqueia o domínio. Ver docs/tecnofit-integration.md.
 *
 * O brief do projeto é explícito: NÃO INVENTAR ENDPOINTS, NÃO ASSUMIR CAMPOS.
 * Por isso os paths abaixo estão VAZIOS por padrão. Com eles vazios, o
 * provider HTTP recusa a chamada com um erro claro (NOT_CONFIGURED) em vez
 * de disparar uma requisição adivinhada contra a API de produção.
 *
 * COMO ATIVAR A INTEGRAÇÃO REAL — três passos, nenhuma linha de lógica muda:
 *
 *   1. Abra a documentação oficial e anote path + método de cada recurso.
 *   2. Preencha `paths` e `fields` neste arquivo (ou via TECNOFIT_ENDPOINT_MAP,
 *      um JSON no ambiente, que tem precedência).
 *   3. Rode `npm run tecnofit:probe` para validar contra a API real.
 *
 * O mapeamento de campos usa caminhos com ponto e aceita alternativas:
 * `['data.id', 'id', 'student_id']` tenta cada um até encontrar valor.
 * Isso absorve variação de nomenclatura sem exigir mudança de código.
 */

export interface EndpointDefinition {
  /** Path relativo à base URL. Vazio = recurso não configurado. */
  path: string;
  method: 'GET' | 'POST';
}

export interface EndpointMap {
  paths: {
    /**
     * Endpoint que troca api_key + api_secret pelo token de acesso temporário.
     * CONFIRMADO: a Tecnofit usa fluxo de duas etapas (ver docs).
     */
    authToken: EndpointDefinition;
    healthCheck: EndpointDefinition;
    listAccessPoints: EndpointDefinition;
    listAccessEvents: EndpointDefinition;
    getStudent: EndpointDefinition;
    searchStudents: EndpointDefinition;
  };
  /** Nome dos parâmetros de query esperados pela API. */
  queryParams: {
    since: string;
    until: string;
    cursor: string;
    limit: string;
    search: string;
  };
  /**
   * Fluxo de autenticação por troca de credenciais.
   * Os nomes dos campos do corpo vêm da tela de criação de chave no painel
   * Tecnofit, que rotula as credenciais como `api_key` e `api_secret`.
   */
  auth: {
    keyField: string;
    secretField: string;
    /** Onde o token vem na resposta. Primeiro caminho com valor vence. */
    tokenPath: string[];
    /** Validade em segundos, quando informada. */
    expiresInPath: string[];
    /** Validade como timestamp absoluto, quando informada. */
    expiresAtPath: string[];
    /** Usada quando a API não informa validade alguma. */
    fallbackTtlSeconds: number;
  };
  /** Onde encontrar a lista dentro do envelope de resposta. */
  collection: {
    itemsPath: string[];
    nextCursorPath: string[];
  };
  /** Mapeamento de campos: destino -> lista de caminhos candidatos na origem. */
  fields: {
    student: Record<string, string[]>;
    accessPoint: Record<string, string[]>;
    accessEvent: Record<string, string[]>;
  };
  /** Tradução de valores de status/tipo vindos da API. */
  valueMaps: {
    studentStatus: Record<string, 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'UNKNOWN'>;
    accessEventType: Record<string, 'ENTRY' | 'EXIT' | 'DENIED' | 'UNKNOWN'>;
  };
}

const EMPTY: EndpointDefinition = { path: '', method: 'GET' };

export const DEFAULT_ENDPOINT_MAP: EndpointMap = {
  // Todos vazios de propósito. Preencher só com a documentação em mãos.
  paths: {
    // O path do endpoint de autenticação também precisa vir da documentação.
    authToken: { path: '', method: 'POST' },
    healthCheck: { ...EMPTY },
    listAccessPoints: { ...EMPTY },
    listAccessEvents: { ...EMPTY },
    getStudent: { ...EMPTY },
    searchStudents: { ...EMPTY },
  },

  // Nomes convencionais de paginação. Ajustar conforme a documentação.
  queryParams: {
    since: 'since',
    until: 'until',
    cursor: 'cursor',
    limit: 'limit',
    search: 'search',
  },

  auth: {
    // CONFIRMADO pela tela de criação de chave no painel Tecnofit.
    keyField: 'api_key',
    secretField: 'api_secret',
    tokenPath: ['access_token', 'accessToken', 'token', 'data.token', 'data.access_token'],
    expiresInPath: ['expires_in', 'expiresIn', 'data.expires_in'],
    expiresAtPath: ['expires_at', 'expiresAt', 'expiration', 'data.expires_at'],
    // Conservador de propósito: se a API não disser a validade, renovamos a
    // cada 10 minutos. Renovar demais custa uma requisição; usar token
    // expirado quebra a ingestão inteira.
    fallbackTtlSeconds: 600,
  },

  collection: {
    itemsPath: ['data', 'items', 'results', 'records'],
    nextCursorPath: ['next_cursor', 'meta.next_cursor', 'paging.next', 'links.next'],
  },

  /**
   * Candidatos de campo. A ordem importa: o primeiro caminho com valor vence.
   * Cobrimos as convenções mais comuns (snake_case e camelCase) para que a
   * integração funcione com ajuste mínimo — mas nada aqui é uma afirmação
   * sobre o que a API realmente devolve.
   */
  fields: {
    student: {
      externalId: ['id', 'student_id', 'studentId', 'customer_id', 'codigo'],
      fullName: ['name', 'full_name', 'fullName', 'nome'],
      firstName: ['first_name', 'firstName', 'primeiro_nome'],
      photoUrl: ['photo_url', 'photoUrl', 'avatar', 'foto'],
      status: ['status', 'situacao', 'state'],
      planName: ['plan.name', 'plan_name', 'planName', 'plano'],
      modalities: ['modalities', 'modalidades', 'activities'],
      memberSince: ['member_since', 'memberSince', 'created_at', 'data_matricula'],
      planExpiresAt: ['plan.expires_at', 'plan_expires_at', 'vencimento'],
    },
    accessPoint: {
      externalId: ['id', 'access_point_id', 'accessPointId', 'device_id'],
      name: ['name', 'nome', 'label', 'description'],
      description: ['description', 'descricao'],
      location: ['location', 'local', 'unit', 'unidade'],
      active: ['active', 'ativo', 'enabled'],
    },
    accessEvent: {
      externalEventId: ['id', 'event_id', 'eventId', 'access_id'],
      studentExternalId: ['student_id', 'studentId', 'customer_id', 'member_id', 'student.id'],
      accessPointExternalId: ['access_point_id', 'accessPointId', 'device_id', 'access_point.id'],
      accessPointLabel: ['access_point_name', 'access_point.name', 'device_name', 'catraca'],
      eventType: ['type', 'event_type', 'direction', 'tipo'],
      occurredAt: ['occurred_at', 'occurredAt', 'datetime', 'created_at', 'data_hora'],
    },
  },

  valueMaps: {
    studentStatus: {
      active: 'ACTIVE', ativo: 'ACTIVE', '1': 'ACTIVE',
      inactive: 'INACTIVE', inativo: 'INACTIVE', '0': 'INACTIVE',
      suspended: 'SUSPENDED', suspenso: 'SUSPENDED', bloqueado: 'SUSPENDED',
    },
    accessEventType: {
      entry: 'ENTRY', entrada: 'ENTRY', in: 'ENTRY', '1': 'ENTRY',
      exit: 'EXIT', saida: 'EXIT', 'saída': 'EXIT', out: 'EXIT', '2': 'EXIT',
      denied: 'DENIED', negado: 'DENIED', blocked: 'DENIED',
    },
  },
};

/**
 * Carrega o mapa efetivo. `TECNOFIT_ENDPOINT_MAP` (JSON) sobrescreve o padrão
 * por merge raso em cada seção — assim dá para ajustar só `paths` sem
 * reescrever o mapeamento de campos inteiro.
 */
export function loadEndpointMap(rawJson = process.env.TECNOFIT_ENDPOINT_MAP): EndpointMap {
  if (!rawJson) return DEFAULT_ENDPOINT_MAP;

  let override: Partial<EndpointMap>;
  try {
    override = JSON.parse(rawJson) as Partial<EndpointMap>;
  } catch {
    throw new Error('TECNOFIT_ENDPOINT_MAP não é um JSON válido.');
  }

  return {
    paths: { ...DEFAULT_ENDPOINT_MAP.paths, ...override.paths },
    queryParams: { ...DEFAULT_ENDPOINT_MAP.queryParams, ...override.queryParams },
    auth: { ...DEFAULT_ENDPOINT_MAP.auth, ...override.auth },
    collection: { ...DEFAULT_ENDPOINT_MAP.collection, ...override.collection },
    fields: {
      student: { ...DEFAULT_ENDPOINT_MAP.fields.student, ...override.fields?.student },
      accessPoint: { ...DEFAULT_ENDPOINT_MAP.fields.accessPoint, ...override.fields?.accessPoint },
      accessEvent: { ...DEFAULT_ENDPOINT_MAP.fields.accessEvent, ...override.fields?.accessEvent },
    },
    valueMaps: {
      studentStatus: {
        ...DEFAULT_ENDPOINT_MAP.valueMaps.studentStatus,
        ...override.valueMaps?.studentStatus,
      },
      accessEventType: {
        ...DEFAULT_ENDPOINT_MAP.valueMaps.accessEventType,
        ...override.valueMaps?.accessEventType,
      },
    },
  };
}
