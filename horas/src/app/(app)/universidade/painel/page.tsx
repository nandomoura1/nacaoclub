import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EDU_AREAS, labelOf } from '@/domain/universidade';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { eduPanel } from '@/server/services/edu-service';

export const metadata: Metadata = { title: 'Quem concluiu · Universidade Nação' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'edu.edit')) redirect('/universidade');
  const p = await eduPanel(principal);
  const ok = p.people.filter((x) => x.required.total && x.required.done === x.required.total).length;
  const withReq = p.people.filter((x) => x.required.total).length;
  return (
    <>
      <PageHeader title="Quem concluiu" description="Andamento da capacitação: obrigatórios e trilhas de cada colaborador, e quantos concluíram cada material." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Em dia com os obrigatórios</p><p className="mt-1 text-2xl font-extrabold text-nacao tabular-nums">{ok}/{withReq}</p></Card>
        <Card className="p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Materiais publicados</p><p className="mt-1 text-2xl font-extrabold text-navy tabular-nums">{p.materials.length}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <p className="border-b border-borda px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Por colaborador</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-fundo text-xs text-tinta-suave"><tr><th className="px-3 py-2 text-left">Colaborador</th><th className="px-3 py-2 text-left">Obrigatórios</th><th className="px-3 py-2 text-left">Trilhas</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {p.people.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="px-3 py-2"><b className="text-navy">{u.name}</b><span className="block text-xs text-tinta-suave">{u.roles}</span></td>
                  <td className="px-3 py-2">
                    {u.required.total === 0 ? <span className="text-xs text-tinta-fraca">—</span> : u.required.done === u.required.total ? <Badge tone="green">✓ {u.required.done}/{u.required.total}</Badge> : <>
                      <Badge tone="amber">{u.required.done}/{u.required.total}</Badge>
                      <span className="mt-0.5 block text-xs text-tinta-suave">Falta: {u.required.pending.slice(0, 3).join(', ')}{u.required.pending.length > 3 ? '…' : ''}</span>
                    </>}
                  </td>
                  <td className="px-3 py-2">
                    {u.tracks.length === 0 ? <span className="text-xs text-tinta-fraca">—</span> : u.tracks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        <span className="w-40 truncate">{t.name}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-fundo"><div className={t.finished ? 'h-full bg-sucesso' : 'h-full bg-nacao'} style={{ width: `${t.pct}%` }} /></div>
                        <span className="tabular-nums text-tinta-suave">{t.completed}/{t.total}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-4 overflow-hidden">
        <p className="border-b border-borda px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Por material</p>
        <ul className="divide-y divide-borda">
          {p.materials.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><b className="text-navy">{m.title}</b> <span className="text-xs text-tinta-suave">{labelOf(EDU_AREAS, m.area)}</span> {m.required && <Badge tone="amber">Obrigatório</Badge>}</span>
              <span className="tabular-nums text-tinta-suave"><b className="text-navy">{m.done}</b> concluíram</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
