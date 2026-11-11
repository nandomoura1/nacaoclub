import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { formatDateBR } from '@/domain/dates';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { crmAgents, listConsultants, syncOverview } from '@/server/services/crm-service';
import { ConsultantLinks } from './ConsultantLinks';
import { SyncButton } from './SyncButton';

export const metadata: Metadata = { title: 'Cobrança · Configurações' };

const STATUS: Record<string, { label: string; tone: 'green' | 'blue' | 'red' }> = {
  CONCLUIDA: { label: 'Concluída', tone: 'green' },
  RODANDO: { label: 'Em andamento', tone: 'blue' },
  FALHOU: { label: 'Falhou', tone: 'red' },
};
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'crm.admin')) redirect('/cobranca');
  const [sync, consultants, agents] = await Promise.all([syncOverview(principal), listConsultants(principal), crmAgents(principal)]);
  const c = sync.config;
  return (
    <>
      <PageHeader title="Cobrança · Configurações" description="Conexão com a Tecnofit (só leitura), sincronização diária e o vínculo de cada consultor da Tecnofit com um usuário do Nação ADM." />

      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-semibold text-tinta">Tecnofit</h2>
        {c.fake ? (
          <p className="text-sm text-atencao">Modo SIMULADO (TECNOFIT_FAKE=1): dados de exemplo, nada vem da Tecnofit.</p>
        ) : c.configured ? (
          <p className="text-sm text-tinta-suave">Conectada a <code>{c.base}</code> · chave {c.keyHint}{c.companyId ? ` · unidade ${c.companyId}` : ''}.</p>
        ) : (
          <p className="text-sm text-critico">Não configurada: cadastre <code>TECNOFIT_API_KEY</code> e <code>TECNOFIT_API_SECRET</code> nas variáveis da Vercel (chave só de leitura).</p>
        )}
        <p className="mt-1 text-xs text-tinta-suave">
          O sistema <strong>não fala com o aluno</strong>: gera as Tarefas de CRM de cada consultor. A lista do dia sai às 07h30 no WhatsApp do consultor
          (só contagens e o link; ligue em Administração → <a className="font-semibold text-nacao underline" href="/admin/whatsapp/automacoes">Automações</a> → &quot;Tarefas de CRM do dia&quot;, que nasce desligada; o WhatsApp vem do cadastro do usuário).
        </p>
        <p className="mt-1 text-xs text-tinta-suave">Roda sozinha todo dia às 05h17. Do espelho saem só nome, status, celular e vendas em aberto — nada de CPF, RG, endereço, cartão ou exame médico.</p>
        <div className="mt-3"><SyncButton disabled={!c.configured} /></div>
        {sync.runs.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-tinta-suave"><tr><th className="py-1 pr-3">Dia</th><th className="pr-3">Situação</th><th className="pr-3">Alunos</th><th className="pr-3">Casos abertos / resolvidos</th><th className="pr-3">Pagamentos vistos</th><th className="pr-3">Chamadas</th><th>Fim</th></tr></thead>
              <tbody className="divide-y divide-borda">
                {sync.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3">{formatDateBR(r.day)}{r.mode === 'SIMULADO' && <Badge className="ml-1">simulado</Badge>}</td>
                    <td className="pr-3"><Badge tone={STATUS[r.status]?.tone ?? 'blue'}>{STATUS[r.status]?.label ?? r.status}</Badge>{r.error && <span className="ml-1 text-critico">{r.error}</span>}</td>
                    <td className="pr-3">{r.stats.processed ?? 0}/{r.stats.candidates ?? 0}{r.remaining ? ` (faltam ${r.remaining})` : ''}</td>
                    <td className="pr-3">{r.stats.casesOpened ?? 0} / {r.stats.casesResolved ?? 0}</td>
                    <td className="pr-3">{r.stats.debtsPaid ?? 0}</td>
                    <td className="pr-3">{r.apiCalls}</td>
                    <td>{at(r.finishedAt)}{r.stats.errors?.length ? <span className="ml-1 text-atencao">· {r.stats.errors.length} aluno(s) com erro</span> : null}{r.stats.warning ? <span className="ml-1 block text-atencao">{r.stats.warning}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-semibold text-tinta">Consultores da Tecnofit ↔ usuários</h2>
        <p className="mb-3 text-xs text-tinta-suave">
          O responsável por cada caso é o consultor do aluno na Tecnofit (o da ligação de CRM mais recente). Vincule cada consultor ao usuário dele aqui —
          sempre escolhendo a pessoa, nunca pelo nome. Aluno sem consultor vinculado cai em &quot;Sem responsável&quot; e o líder distribui.
          Só aparecem na lista usuários com o perfil CRM / Cobrança ou Líder de CRM.
        </p>
        {consultants.length === 0
          ? <p className="text-sm text-tinta-suave">Nenhum consultor ainda: rode a primeira sincronização.</p>
          : <ConsultantLinks consultants={consultants} agents={agents} />}
      </Card>
    </>
  );
}
