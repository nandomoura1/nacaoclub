import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { todayIso } from '@/lib/today';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listKnowledge, memoryContext } from '@/server/services/mkt-memory-service';
import { MemoryClient } from './MemoryClient';

export const metadata: Metadata = { title: 'Memória da Nação' };
// "Gerar aprendizados" chama a IA.
export const maxDuration = 300;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.view')) redirect('/hoje');
  const [rows, ctx] = await Promise.all([listKnowledge(principal), memoryContext(todayIso())]);
  return (
    <>
      <PageHeader title="Memória da Nação" description="O que a IA de marketing sabe sobre a Nação: aprendizados aprovados pela equipe + o que fizemos no mesmo período do ano passado. Entra em toda sugestão de tarefas e recomendação." />
      <MemoryClient rows={rows} history={ctx.historico} perms={{ admin: can(principal, 'mkt.admin'), ai: can(principal, 'mkt.ai') }} />
    </>
  );
}
