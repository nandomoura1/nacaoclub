/**
 * Contrato de domínio da integração Tecnofit.
 *
 * Estes tipos representam o que o NOSSO sistema precisa — não o que a API
 * devolve. A tradução entre os dois vive em `normalizer.ts`, guiada pelo
 * mapa declarativo de `endpoint-map.ts`.
 *
 * Todo campo é opcional por princípio: quando a API não fornece um dado,
 * ele fica `undefined` e a UI mostra "não informado". Nunca inventamos valor.
 */

export type TecnofitStudentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'UNKNOWN';

export interface TecnofitStudent {
  /** Identificador externo. Único campo verdadeiramente obrigatório. */
  externalId: string;
  fullName: string;
  firstName?: string;
  photoUrl?: string;
  status?: TecnofitStudentStatus;
  planName?: string;
  /** Vazio significa "não informado pela API", nunca "aluno sem modalidade". */
  modalities?: string[];
  memberSince?: Date;
  planExpiresAt?: Date;
  /** Payload cru normalizado, para depuração. Sem credenciais. */
  raw?: Record<string, unknown>;
}

export interface TecnofitAccessPoint {
  externalId: string;
  name: string;
  description?: string;
  location?: string;
  active?: boolean;
  raw?: Record<string, unknown>;
}

export type TecnofitAccessEventType = 'ENTRY' | 'EXIT' | 'DENIED' | 'UNKNOWN';

export interface TecnofitAccessEvent {
  /** ID único do evento na origem, quando existir. */
  externalEventId?: string;
  studentExternalId: string;
  /** Pode vir como ID ou como rótulo textual, dependendo da origem. */
  accessPointExternalId?: string;
  accessPointLabel?: string;
  eventType: TecnofitAccessEventType;
  occurredAt: Date;
  raw?: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  /** Cursor opaco para a próxima página. Ausente = fim. */
  nextCursor?: string;
}

export interface ListAccessEventsParams {
  /** Só eventos a partir deste instante (inclusive). */
  since?: Date;
  until?: Date;
  cursor?: string;
  limit?: number;
}

/**
 * Porta (no sentido de ports & adapters) da integração.
 * O restante do sistema conhece SOMENTE esta interface.
 * Trocar `mock` por `http` não toca em nenhum service de domínio.
 */
export interface TecnofitProvider {
  readonly name: 'mock' | 'http';

  /** Verifica conectividade e credenciais sem efeito colateral. */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;

  listAccessPoints(): Promise<TecnofitAccessPoint[]>;
  listAccessEvents(params: ListAccessEventsParams): Promise<Page<TecnofitAccessEvent>>;
  getStudent(externalId: string): Promise<TecnofitStudent | null>;
  searchStudents(query: string, limit?: number): Promise<TecnofitStudent[]>;
}

/** Erro tipado da integração — permite decidir retry vs. falha definitiva. */
export class TecnofitError extends Error {
  constructor(
    message: string,
    readonly kind:
      | 'NOT_CONFIGURED'
      | 'UNAUTHORIZED'
      | 'RATE_LIMITED'
      | 'TIMEOUT'
      | 'NETWORK'
      | 'BAD_RESPONSE'
      | 'NOT_FOUND'
      | 'UNKNOWN',
    readonly status?: number,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'TecnofitError';
  }
}
