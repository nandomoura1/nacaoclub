import { Card } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/format';
import type { HoursReportResult } from '@/server/services/report-service';

const STATUS: Record<string, string> = {
  PREVISTA: 'dada', REALIZADA: 'dada', SUBSTITUIDA: 'substituída', CANCELADA: 'cancelada',
  AUSENTE_PENDENTE: 'aguardando substituto', AGUARDANDO_DECISAO_FERIADO: 'feriado: aguardando',
};

/** Extrato de horas de um professor: totais e aula a aula (ficha do professor e "Meu extrato"). */
export function HoursStatement({ r, teacherId }: { r: HoursReportResult; teacherId: string }) {
  const me = r.byTeacher[0];
  const cards = me ? [
    ['Previstas', me.plannedMin], ['Dadas', me.ownMin], ['Substituições', me.substitutionMin], ['Extras', me.extraMin], ['Dom./feriado (dobro)', me.bonusMin],
    ['Ausências', me.absenceMin], ['Canceladas', me.cancelledMin], ['Aguardando', me.pendingMin],
  ] as const : [];
  return (
    <>
      {!me ? (
        <Card className="p-8 text-center text-sm text-tinta-suave">Nenhuma aula nesta competência.</Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            <Card className="col-span-2 bg-navy p-4 text-white sm:col-span-1">
              <p className="tabular text-2xl font-extrabold">{formatMinutes(me.totalMin)}</p>
              <p className="text-xs text-white/70">total a pagar</p>
            </Card>
            {cards.map(([label, min]) => (
              <Card key={label} className="p-4">
                <p className={cn('tabular text-lg font-extrabold', min ? 'text-navy' : 'text-tinta-fraca')}>{formatMinutes(min)}</p>
                <p className="text-xs text-tinta-fraca">{label}</p>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-borda bg-fundo text-left text-[11px] font-bold uppercase tracking-wide text-tinta-suave">
                <tr><th className="px-2 py-2">Data</th><th className="px-2 py-2">Hora</th><th className="px-2 py-2">Aula</th><th className="px-2 py-2">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {r.detail.map((o, i) => {
                  const mine = o.people.find((p) => p.plannedId === teacherId) ?? o.people.find((p) => p.executingId === teacherId);
                  const covering = mine && mine.plannedId !== teacherId;
                  const status = o.status === 'PREVISTA' || o.status === 'REALIZADA' ? (mine?.status ?? o.status) : o.status;
                  return (
                    <tr key={i} className={cn((status === 'CANCELADA' || status === 'AUSENTE_PENDENTE') && 'text-tinta-fraca')}>
                      <td className="tabular whitespace-nowrap px-2 py-1.5">{formatDateBR(o.date)}{o.doubled && <span className="ml-1 rounded bg-ciano/15 px-1 text-[10px] font-bold text-navy" title="Domingo ou feriado: vale o dobro">×2</span>}</td>
                      <td className="tabular px-2 py-1.5">{o.start} · {formatMinutes(o.durationMin)}</td>
                      <td className="px-2 py-1.5">{o.modality}{o.label ? ` · ${o.label}` : ''}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {covering ? <b className="text-nacao">substituiu {mine.planned ?? '—'}</b> : (STATUS[status] ?? status)}
                        {!covering && mine?.status === 'SUBSTITUIDA' && <span className="text-tinta-suave"> · {mine.executing ?? 'ninguém'} deu a aula</span>}
                        {o.note ? ` · ${o.note}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {me && me.bonusMin > 0 && (
        <p className="mt-2 text-xs text-tinta-suave">Domingo e feriado valem o dobro: as horas trabalhadas nesses dias entram de novo como adicional ({formatMinutes(me.bonusMin)}).</p>
      )}
    </>
  );
}
