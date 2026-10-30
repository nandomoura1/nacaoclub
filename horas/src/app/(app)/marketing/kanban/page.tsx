import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { mktOptions } from '@/server/services/marketing-service';
import { board } from '@/server/services/mkt-task-service';
import { KanbanClient } from './KanbanClient';
import { NewTaskButton } from './NewTaskButton';

export const metadata: Metadata = { title: 'Kanban de Marketing' };

export default async function Page({ searchParams }: { searchParams: Promise<{ campanha?: string; area?: string; responsavel?: string; q?: string; tag?: string; atrasadas?: string; tarefa?: string }> }) {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const sp = await searchParams;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const [{ tasks, columns }, options] = await Promise.all([
    board(principal, todayIso(), { campaignId: uuid(sp.campanha), areaKey: sp.area || undefined, assigneeId: uuid(sp.responsavel), q: sp.q?.slice(0, 80) || undefined, tag: sp.tag?.slice(0, 30) || undefined, late: sp.atrasadas === '1' }),
    mktOptions(),
  ]);
  const canEdit = can(principal, 'mkt.edit');
  const filtered = !!(sp.campanha || sp.area || sp.responsavel || sp.q || sp.tag || sp.atrasadas);
  return (
    <>
      <PageHeader title="Kanban de Marketing" description="Arraste os cartões entre as colunas. Tarefa com dependência só conclui depois dela. As colunas se ajustam em Configurações." actions={canEdit ? <div className="flex flex-wrap gap-2">{can(principal, 'mkt.admin') && <Link href="/marketing/importar-trello" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>Importar do Trello</Link>}<NewTaskButton options={options} siblings={tasks.map((t) => ({ id: t.id, title: t.title, campaignId: t.campaign?.id ?? null }))} /></div> : undefined} />
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Select name="campanha" defaultValue={sp.campanha ?? ''} className="h-9 w-auto min-w-40"><option value="">Todas as campanhas</option>{options.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="area" defaultValue={sp.area ?? ''} className="h-9 w-auto"><option value="">Todas as áreas</option>{options.areas.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</Select>
        <Select name="responsavel" defaultValue={sp.responsavel ?? ''} className="h-9 w-auto"><option value="">Todos</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-tinta-fraca" /><Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar" className="h-9 w-40 pl-7" /></div>
        <Input name="tag" defaultValue={sp.tag ?? ''} placeholder="#tag" className="h-9 w-24" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="atrasadas" value="1" defaultChecked={sp.atrasadas === '1'} /> só atrasadas</label>
        <Button type="submit" size="sm" variant="secondary">Filtrar</Button>
        {filtered && <Link href="/marketing/kanban" className="text-xs font-semibold text-nacao">limpar</Link>}
      </form>
      <KanbanClient tasks={tasks} columns={columns} options={options} canEdit={canEdit} openId={uuid(sp.tarefa) ?? null} />
    </>
  );
}
