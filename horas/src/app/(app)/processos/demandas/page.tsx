import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listDemands, procPeople } from '@/server/services/proc-service';
import { DemandsClient } from './DemandsClient';

export const metadata: Metadata = { title: 'Demandas' };

export default async function Page({ searchParams }: { searchParams: Promise<{ setor?: string; ver?: string; minhas?: string; nova?: string; modo?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'proc.view')) redirect('/hoje');
  const sp = await searchParams;
  const today = todayIso();
  const admin = can(principal, 'proc.admin');
  const kanban = sp.modo === 'kanban';
  // Kanban: em aberto + concluídas dos últimos 30 dias (canceladas ficam na lista).
  const view = kanban ? 'todas' : sp.ver === 'concluidas' || sp.ver === 'todas' ? sp.ver : 'abertas';
  const [all, sectors, people] = await Promise.all([
    listDemands(principal, today, { sectorId: sp.setor, view, mine: sp.minhas === '1' }),
    prisma.procSector.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, leaderId: true } }),
    procPeople(),
  ]);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const demands = kanban ? all.filter((d) => d.status !== 'CANCELADA' && (d.status !== 'CONCLUIDA' || (d.doneAt ?? '') >= since)) : all;
  // Quem pode abrir demanda em cada setor: diretoria em todos; líder nos seus.
  const openable = sectors.filter((s) => admin || (can(principal, 'proc.edit') && s.leaderId === principal.id));
  return (
    <>
      <PageHeader title="Demandas" description="O que a gestão acompanha em cada setor: responsável, prazo e andamento. Rotinas do dia a dia ficam no Nação Task." />
      <DemandsClient
        today={today} demands={demands} sectors={admin ? sectors : sectors.filter((s) => s.leaderId === principal.id || demands.some((d) => d.sectorId === s.id))}
        openable={openable.map((s) => s.id)} people={people.map((p) => ({ id: p.id, name: p.name }))}
        filter={{ sector: sp.setor ?? '', view, mine: sp.minhas === '1', kanban }} openNew={sp.nova === '1'} admin={admin}
      />
    </>
  );
}
