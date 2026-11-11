import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { teamRules } from '@/server/services/crm-task-service';
import { TeamRules } from './TeamRules';

export const metadata: Metadata = { title: 'Time de CRM' };

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'crm.view_all')) redirect('/cobranca/tarefas');
  const [team, auto] = await Promise.all([teamRules(principal), prisma.waAutomation.findFirst({ where: { audience: 'CRM_TAREFAS' }, select: { active: true } })]);
  return (
    <>
      <PageHeader
        title="Time de CRM"
        description="Para cada consultor: quais tipos de tarefa entram na lista dele e a que horas (e em que dias) chega o WhatsApp com o resumo. Assim a mensagem não chega antes do expediente. O que ficar de fora das regras aparece só para você, em Tarefas → Fora das regras."
      />
      {!auto?.active && (
        <p className="mb-3 rounded-lg bg-atencao/10 px-3 py-2 text-sm text-atencao">
          O envio por WhatsApp está desligado. Para ligar: Administração → <a className="font-semibold underline" href="/admin/whatsapp/automacoes">Automações</a> → &quot;Tarefas de CRM do dia&quot;.
        </p>
      )}
      {team.length === 0
        ? <Card className="p-8 text-center text-sm text-tinta-suave">Ninguém no time ainda: dê o perfil CRM / Cobrança ou Líder de CRM em Administração → Usuários.</Card>
        : <TeamRules team={team} />}
    </>
  );
}
