import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { leadsWebhookToken } from '@/server/services/mkt-leads-service';
import { CopyField } from './CopyField';

export const metadata: Metadata = { title: 'Integrações do Marketing' };
export const dynamic = 'force-dynamic';

type Status = 'ok' | 'parcial' | 'falta';
interface Integration { key: string; name: string; status: Status; unlocks: string[]; vars: { key: string; ok: boolean; what: string }[]; steps: string[]; note?: string; webhook?: string | null; extra?: string }

const env = (k: string) => !!process.env[k]?.trim();
const statusOf = (vars: { ok: boolean; required?: boolean }[]): Status => (vars.every((v) => v.ok) ? 'ok' : vars.some((v) => v.ok) ? 'parcial' : 'falta');
const STATUS = { ok: { label: 'Conectado', tone: 'green', icon: CheckCircle2 }, parcial: { label: 'Parcial', tone: 'amber', icon: CircleDot }, falta: { label: 'Não configurado', tone: 'neutral', icon: CircleDashed } } as const;

export default async function Page() {
  const principal = await requirePrincipal();
  if (!can(principal, 'mkt.admin')) redirect('/marketing');
  const h = await headers();
  const base = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const token = leadsWebhookToken();
  const [siteLeads, lastSite] = await Promise.all([
    prisma.mktLead.count({ where: { source: { in: ['SITE', 'LINK', 'META_ADS', 'GOOGLE', 'INSTAGRAM'] }, externalRef: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.mktLead.findFirst({ where: { externalRef: { not: null } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const zapi = zapiConfig();

  const list: Integration[] = [
    {
      key: 'wix', name: 'Site (Wix) → Leads', status: !token ? 'falta' : lastSite ? 'ok' : 'parcial',
      unlocks: ['Leads & Conversão: formulários do site entram sozinhos no funil'],
      vars: [{ key: 'CRON_SECRET (ou LEADS_WEBHOOK_TOKEN)', ok: !!token, what: 'Senha que protege o endereço do webhook' }],
      webhook: token ? `${base}/api/webhooks/leads?token=${token}&origem=SITE` : null,
      extra: lastSite ? `${siteLeads} lead(s) do site nos últimos 30 dias · último em ${lastSite.createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : 'Nenhum lead recebido pelo webhook ainda.',
      steps: [
        'No painel do Wix (manage.wix.com), abra o site Nação Club → Automações → “+ Nova automação” → “Começar do zero”.',
        'Gatilho: “Formulário enviado” (Wix Forms) → escolha o formulário (ex.: Aula experimental / Contato). Repita para cada formulário.',
        'Ação: “Enviar dados via webhook” (ou “Enviar solicitação HTTP”) → método POST → cole o endereço abaixo → corpo JSON com todos os campos.',
        'Ative a automação e envie um teste pelo próprio site: o lead aparece em Leads & Conversão em segundos.',
        'Dica: para campanhas, troque “origem=SITE” por “origem=INSTAGRAM”, “META_ADS” ou “GOOGLE” e acrescente “&campanha=Nome da campanha”.',
      ],
    },
    {
      key: 'whatsapp', name: 'WhatsApp (Z-API)', status: zapi.configured ? 'ok' : 'falta',
      unlocks: ['Leads: “Chamar no WhatsApp”', 'Comunicação interna e automações', 'Respostas (webhook) e confirmações'],
      vars: [{ key: 'ZAPI_INSTANCE_ID / ZAPI_INSTANCE_TOKEN / ZAPI_CLIENT_TOKEN', ok: zapi.configured, what: 'Credenciais da instância' }, { key: 'CRON_SECRET', ok: env('CRON_SECRET'), what: 'Agendador das automações' }],
      steps: ['Já configurado em Administração → WhatsApp (Z-API). Lá ficam o teste, o webhook de respostas e as automações.'],
    },
    {
      key: 'ia', name: 'IA (Claude)', status: env('ANTHROPIC_API_KEY') ? 'ok' : 'falta',
      unlocks: ['IA Marketing: textos, ideias de conteúdo e análise de campanhas', 'Leitura de cronogramas e documentos'],
      vars: [{ key: 'ANTHROPIC_API_KEY', ok: env('ANTHROPIC_API_KEY'), what: 'Chave da API (console.anthropic.com → API Keys)' }],
      steps: ['Já usada no Financeiro e nos Treinos. Nada a fazer se estiver “Conectado”.'],
    },
    {
      key: 'meta', name: 'Meta — Instagram, Facebook e Anúncios', status: statusOf([{ ok: env('META_ACCESS_TOKEN') }, { ok: env('META_IG_USER_ID') }, { ok: env('META_AD_ACCOUNT_ID') }]),
      unlocks: ['Conteúdo & Social: métricas dos posts e agendamento no Instagram', 'Tráfego Pago: gasto, alcance, leads e custo por lead dos anúncios', 'Performance: seguidores e engajamento'],
      vars: [
        { key: 'META_ACCESS_TOKEN', ok: env('META_ACCESS_TOKEN'), what: 'Token do “usuário do sistema” (não expira)' },
        { key: 'META_IG_USER_ID', ok: env('META_IG_USER_ID'), what: 'ID da conta profissional do Instagram' },
        { key: 'META_PAGE_ID', ok: env('META_PAGE_ID'), what: 'ID da Página do Facebook ligada ao Instagram' },
        { key: 'META_AD_ACCOUNT_ID', ok: env('META_AD_ACCOUNT_ID'), what: 'Conta de anúncios (formato act_123…)' },
      ],
      steps: [
        'Pré-requisito: Instagram da Nação como conta Profissional, ligado a uma Página do Facebook, dentro do Gerenciador de Negócios (business.facebook.com).',
        'developers.facebook.com → Meus apps → Criar app → tipo “Empresa/Negócios” → ligue ao Gerenciador de Negócios da Nação. Adicione os produtos “Instagram Graph API” e “Marketing API”.',
        'business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema → Adicionar (função Administrador) → “Atribuir ativos”: Página, conta do Instagram e conta de anúncios (controle total).',
        'No mesmo usuário do sistema → “Gerar novo token” → escolha o app → marque: instagram_basic, instagram_manage_insights, instagram_content_publish, pages_show_list, pages_read_engagement, ads_read, business_management → validade “Nunca”. Copie o token.',
        'IDs: Configurações do negócio → Contas → Contas do Instagram / Páginas / Contas de anúncio (o ID aparece ao clicar em cada uma).',
        'Na Vercel, crie as 4 variáveis ao lado e faça Redeploy. Me avise: eu ligo a coleta e confiro com você.',
      ],
      note: 'A aprovação do app pela Meta (App Review) só é necessária para publicar em nome de terceiros; para as contas da própria Nação, o usuário do sistema basta.',
    },
    {
      key: 'ga4', name: 'Google Analytics 4 (site)', status: statusOf([{ ok: env('GA4_PROPERTY_ID') }, { ok: env('GOOGLE_SERVICE_ACCOUNT_JSON') }]),
      unlocks: ['Performance: visitas ao site, origem do tráfego e conversões (formulários)'],
      vars: [
        { key: 'GA4_PROPERTY_ID', ok: env('GA4_PROPERTY_ID'), what: 'ID numérico da propriedade (GA4 → Administrador → Detalhes da propriedade)' },
        { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', ok: env('GOOGLE_SERVICE_ACCOUNT_JSON'), what: 'Chave JSON da conta de serviço (conteúdo inteiro)' },
      ],
      steps: [
        'Confirme que o site Wix tem o GA4 ligado (Wix → Marketing → Integrações de marketing → Google Analytics).',
        'console.cloud.google.com → crie um projeto “Nação ADM” → APIs → ative “Google Analytics Data API”.',
        'IAM → Contas de serviço → Criar → depois “Chaves” → Adicionar chave → JSON (baixa um arquivo).',
        'No GA4 → Administrador → Gerenciamento de acesso da propriedade → adicione o e-mail da conta de serviço como “Leitor”.',
        'Na Vercel: GA4_PROPERTY_ID e GOOGLE_SERVICE_ACCOUNT_JSON (cole o conteúdo do arquivo) → Redeploy.',
      ],
    },
    {
      key: 'gads', name: 'Google Ads', status: statusOf([{ ok: env('GOOGLE_ADS_DEVELOPER_TOKEN') }, { ok: env('GOOGLE_ADS_CUSTOMER_ID') }, { ok: env('GOOGLE_ADS_REFRESH_TOKEN') }]),
      unlocks: ['Tráfego Pago: gasto, cliques, conversões e custo por lead das campanhas Google'],
      vars: [
        { key: 'GOOGLE_ADS_DEVELOPER_TOKEN', ok: env('GOOGLE_ADS_DEVELOPER_TOKEN'), what: 'Token de desenvolvedor (Central da API)' },
        { key: 'GOOGLE_ADS_CUSTOMER_ID', ok: env('GOOGLE_ADS_CUSTOMER_ID'), what: 'ID da conta (123-456-7890)' },
        { key: 'GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET', ok: env('GOOGLE_ADS_CLIENT_ID') && env('GOOGLE_ADS_CLIENT_SECRET'), what: 'Cliente OAuth (Google Cloud)' },
        { key: 'GOOGLE_ADS_REFRESH_TOKEN', ok: env('GOOGLE_ADS_REFRESH_TOKEN'), what: 'Autorização da conta (gerada uma vez)' },
      ],
      steps: [
        'O token de desenvolvedor exige uma conta de Administrador (MCC): ads.google.com/home/tools/manager-accounts → crie e vincule a conta da Nação.',
        'Na MCC: Ferramentas → Central da API → solicite o token (o Google aprova o “acesso básico” em alguns dias).',
        'Google Cloud (mesmo projeto do GA4): ative “Google Ads API” → Credenciais → ID do cliente OAuth (tipo “App para computador”).',
        'Com o token aprovado, me avise: eu gero com você o refresh token (uma tela de login do Google) e ligo a coleta.',
      ],
      note: 'Enquanto o token não sai, o gasto do Google pode ser lançado à mão em Tráfego Pago.',
    },
    {
      key: 'storage', name: 'Arquivos (Biblioteca de criativos)', status: statusOf([{ ok: env('SUPABASE_URL') }, { ok: env('SUPABASE_SERVICE_ROLE_KEY') }]),
      unlocks: ['Biblioteca: artes, vídeos e logos organizados por campanha, com aprovação'],
      vars: [
        { key: 'SUPABASE_URL', ok: env('SUPABASE_URL'), what: 'Endereço do projeto Supabase' },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', ok: env('SUPABASE_SERVICE_ROLE_KEY'), what: 'Chave secreta do Supabase — só na Vercel, nunca no navegador' },
      ],
      steps: [
        'Pasta privada “marketing” já criada no Supabase da Nação (até 50 MB por arquivo). Nada a fazer aqui.',
        'supabase.com → entre no projeto da Nação → ícone de engrenagem “Project Settings” (menu da esquerda, embaixo) → “API Keys”.',
        'Copie a chave secreta “service_role” (aba “Legacy API keys” → “Reveal”) ou crie uma “Secret key” nova (aba “API Keys” → “+ New secret key”).',
        'Vercel → projeto nacao-horas → Settings → Environment Variables: crie SUPABASE_URL = https://frhrxdasgfnzdrthjeoi.supabase.co e SUPABASE_SERVICE_ROLE_KEY = a chave copiada (marque “Sensitive”) → Save → Deployments → ⋯ → Redeploy.',
      ],
    },
  ];
  const ready = list.filter((i) => i.status === 'ok').length;

  return (
    <>
      <PageHeader title="Integrações do Marketing" description={`O que já está conectado e o passo a passo do que falta. ${ready} de ${list.length} prontas. Senhas e tokens ficam só nas variáveis da Vercel — nunca no sistema.`} />
      <div className="space-y-3">
        {list.map((i) => {
          const s = STATUS[i.status];
          return (
            <Card key={i.key} className={cn('p-4', i.status === 'ok' && 'border-sucesso/30')}>
              <div className="flex flex-wrap items-center gap-2">
                <s.icon className={cn('size-5', i.status === 'ok' ? 'text-sucesso' : i.status === 'parcial' ? 'text-atencao' : 'text-tinta-fraca')} />
                <h2 className="flex-1 font-bold text-navy">{i.name}</h2>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-4 text-xs text-nacao">{i.unlocks.map((u) => <li key={u}>• {u}</li>)}</ul>
              {i.extra && <p className="mt-1 text-xs text-tinta-suave">{i.extra}</p>}
              {i.webhook !== undefined && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-tinta-suave">Endereço do webhook (cole no Wix)</p>
                  {i.webhook ? <CopyField value={i.webhook} /> : <p className="text-sm text-atencao">Crie a variável CRON_SECRET na Vercel e faça Redeploy: o endereço aparece aqui.</p>}
                </div>
              )}
              {i.status !== 'ok' || i.key === 'wix' ? (
                <details className="mt-2" open={i.status !== 'ok'}>
                  <summary className="cursor-pointer text-sm font-semibold text-navy">Passo a passo</summary>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-tinta">{i.steps.map((st) => <li key={st}>{st}</li>)}</ol>
                  {i.note && <p className="mt-1 text-xs text-tinta-suave">{i.note}</p>}
                </details>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.vars.map((v) => <span key={v.key} title={v.what} className={cn('rounded-md px-2 py-0.5 font-mono text-[11px]', v.ok ? 'bg-sucesso/10 text-sucesso' : 'bg-fundo text-tinta-suave ring-1 ring-borda')}>{v.ok ? '✓' : '○'} {v.key}</span>)}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-tinta-suave">Variáveis: Vercel → projeto nacao-horas → Settings → Environment Variables → Create New (Production) → Save → Deployments → ⋯ → Redeploy. Depois volte aqui: o status muda sozinho. <Link href="/marketing/leads" className="font-semibold text-nacao">Ir para Leads →</Link></p>
    </>
  );
}
