import type { AuditEntry } from '@/services/audit-service';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';

const ACOES: Record<string, { rotulo: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'sky' }> = {
  INSERT: { rotulo: 'Lançou', tone: 'sky' },
  UPDATE: { rotulo: 'Alterou', tone: 'warn' },
  DELETE: { rotulo: 'Excluiu', tone: 'danger' },
  PUBLISH: { rotulo: 'Publicou', tone: 'ok' },
  LOCK: { rotulo: 'Travou', tone: 'danger' },
  UNLOCK: { rotulo: 'Destravou', tone: 'danger' },
  STATUS_CHANGE: { rotulo: 'Mudou status', tone: 'neutral' },
};

/** Histórico legível (§23): "Admin alterou WOD 2 da Dupla 07: bike 8.45 → 8.75". */
export function AuditFeed({ entries }: { entries: readonly AuditEntry[] }) {
  return (
    <Card className="p-5">
      <CardHeader kicker="Rastreabilidade" title="Auditoria" />

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-white/45">
          Nenhuma alteração registrada ainda. Todo lançamento, publicação, travamento e
          correção aparece aqui com autor, horário e os valores antes e depois.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.07]">
          {entries.map((entry) => {
            const acao = ACOES[entry.action] ?? { rotulo: entry.action, tone: 'neutral' as const };
            return (
              <li key={entry.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={acao.tone}>{acao.rotulo}</Badge>
                  {entry.wodNumber ? (
                    <span className="font-display text-xs font-bold">WOD {entry.wodNumber}</span>
                  ) : null}
                  {entry.teamName ? (
                    <span className="text-xs text-white/65">
                      {entry.teamNumber ? `Dupla ${String(entry.teamNumber).padStart(2, '0')} · ` : ''}
                      {entry.teamName}
                    </span>
                  ) : null}
                  <span className="ml-auto tnum text-[11px] text-white/35">
                    {new Date(entry.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {entry.author}
                  </span>
                </div>

                {entry.changes.length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {entry.changes.map((c) => (
                      <li key={c.campo} className="tnum text-xs text-white/55">
                        {c.campo}: <span className="text-white/40">{c.de}</span>{' '}
                        <span aria-label="mudou para">→</span>{' '}
                        <span className="font-bold text-nacao-cyan">{c.para}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
