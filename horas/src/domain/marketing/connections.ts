/**
 * Conexões do Marketing (puro): em que pé está cada integração — dados
 * chegando sozinhos, configurada esperando dados, alimentada à mão ou
 * desligada — e o resumo do painel.
 */

export type ConnStatus = 'auto' | 'waiting' | 'manual' | 'off';
export type Platform = 'Meta' | 'Wix' | 'Google' | 'WhatsApp' | 'Sistema';

export const CONN_STATUS: Record<ConnStatus, { label: string; tone: 'green' | 'amber' | 'blue' | 'neutral'; order: number }> = {
  auto: { label: 'Automático', tone: 'green', order: 0 },
  waiting: { label: 'Aguardando dados', tone: 'amber', order: 1 },
  manual: { label: 'Manual', tone: 'blue', order: 2 },
  off: { label: 'Não conectado', tone: 'neutral', order: 3 },
};
export const PLATFORMS: Platform[] = ['Meta', 'Wix', 'Google', 'WhatsApp', 'Sistema'];

export interface Connection {
  key: string; platform: Platform; name: string; status: ConnStatus;
  /** Uma linha do que está acontecendo. */
  headline: string;
  lastAt: string | null;
  metrics: { label: string; value: string }[];
  /** Telas que esta conexão alimenta. */
  feeds: { label: string; href: string }[];
  /** Próximo passo (quando não está automático). */
  next: string | null;
  /** Âncora no guia de conexão. */
  guide: string | null;
}

/** Recebeu dado nos últimos `days` dias? */
export const isFresh = (lastAt: Date | string | null | undefined, now: Date, days: number) =>
  !!lastAt && now.getTime() - new Date(lastAt).getTime() <= days * 86_400_000;

/** Status de uma conexão por coleta: chave configurada + último dado. */
export function pipeStatus(o: { configured: boolean; lastAuto: Date | null; lastManual: Date | null; now: Date; freshDays: number }): ConnStatus {
  if (o.configured && isFresh(o.lastAuto, o.now, o.freshDays)) return 'auto';
  if (o.configured) return 'waiting';
  if (o.lastManual) return 'manual';
  return 'off';
}

export function summary(list: Pick<Connection, 'status'>[]) {
  const n = (s: ConnStatus) => list.filter((c) => c.status === s).length;
  return { auto: n('auto'), waiting: n('waiting'), manual: n('manual'), off: n('off'), total: list.length };
}
