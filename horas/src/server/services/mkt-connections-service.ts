import { prisma } from '@/server/db';
import { assertCan } from '@/server/auth/authz';
import type { Principal } from '@/server/auth/principal';
import { zapiConfig } from '@/server/whatsapp/zapi';
import { formatBRL } from '@/domain/condominio/money';
import { pipeStatus, type Connection } from '@/domain/marketing/connections';
import { leadsWebhookToken } from './mkt-leads-service';

/**
 * Painel de Conexões do Marketing: para cada integração (Meta, Wix, Google,
 * WhatsApp…), se está ligada, quando chegou o último dado e o que ainda é
 * lançado à mão. Só lê — nada de segredo sai daqui.
 */

const env = (k: string) => !!process.env[k]?.trim();
const DAY = 86_400_000;
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null);
const dm = (d: Date) => d.toISOString().slice(8, 10) + '/' + d.toISOString().slice(5, 7);

export async function connections(principal: Principal | null, now = new Date()): Promise<Connection[]> {
  assertCan(principal, 'mkt.view');
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const webhookLead = (sources: string[]) => ({ source: { in: sources }, externalRef: { not: null } });
  const spend = (platform: string) => Promise.all([
    prisma.mktAdSpend.findFirst({ where: { platform, origin: 'API' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.mktAdSpend.findFirst({ where: { platform, origin: 'MANUAL' }, orderBy: { periodEnd: 'desc' }, select: { periodEnd: true, updatedAt: true } }),
    prisma.mktAdSpend.aggregate({ where: { platform, periodEnd: { gte: since30 } }, _sum: { spendCents: true } }),
  ]);
  const [siteN, siteLast, metaN, metaLast, meta, google, waSent, waFail, waLast, linkClicks, linkLast, aiN] = await Promise.all([
    prisma.mktLead.count({ where: { ...webhookLead(['SITE', 'LINK']), createdAt: { gte: since30 } } }),
    prisma.mktLead.findFirst({ where: webhookLead(['SITE', 'LINK']), orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.mktLead.count({ where: { ...webhookLead(['META_ADS', 'INSTAGRAM']), createdAt: { gte: since30 } } }),
    prisma.mktLead.findFirst({ where: webhookLead(['META_ADS', 'INSTAGRAM']), orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    spend('META'), spend('GOOGLE'),
    prisma.waMessage.count({ where: { status: { in: ['SENT', 'SIMULATED'] }, createdAt: { gte: since7 } } }),
    prisma.waMessage.count({ where: { status: 'FAILED', createdAt: { gte: since7 } } }),
    prisma.waMessage.findFirst({ where: { status: { in: ['SENT', 'SIMULATED'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.mktLinkClickDay.aggregate({ where: { day: { gte: since30 } }, _sum: { clicks: true } }),
    prisma.mktLink.findFirst({ where: { lastClickAt: { not: null } }, orderBy: { lastClickAt: 'desc' }, select: { lastClickAt: true } }),
    prisma.mktAiSuggestion.count({ where: { createdAt: { gte: since30 } } }),
  ]);
  const token = !!leadsWebhookToken();
  const zapi = zapiConfig();

  const adsCard = (key: string, platform: 'Meta' | 'Google', name: string, configured: boolean, [api, manual, sum]: Awaited<ReturnType<typeof spend>>, guide: string, next: string): Connection => {
    const status = pipeStatus({ configured, lastAuto: api?.updatedAt ?? null, lastManual: manual?.periodEnd ?? null, now, freshDays: 3 });
    return {
      key, platform, name, status,
      headline: status === 'auto' ? 'Gasto, cliques e leads chegam sozinhos todo dia.'
        : status === 'waiting' ? 'Chaves configuradas — a coleta automática ainda vai ser ligada.'
        : status === 'manual' ? `Lançado à mão em Tráfego Pago — último período até ${dm(manual!.periodEnd)}.`
        : 'Sem dados: nenhum gasto lançado nem conexão.',
      lastAt: fmt(api?.updatedAt ?? manual?.updatedAt),
      metrics: [{ label: 'Investido (30 dias)', value: formatBRL(sum._sum.spendCents ?? 0) }],
      feeds: [{ label: 'Tráfego Pago', href: '/marketing/trafego' }, { label: 'Performance', href: '/marketing/performance' }],
      next: status === 'auto' ? null : next, guide,
    };
  };

  return [
    {
      key: 'meta-leads', platform: 'Meta', name: 'Leads dos anúncios (Lead Ads)',
      status: metaLast && now.getTime() - metaLast.createdAt.getTime() <= 30 * DAY ? 'auto' : token && metaLast ? 'waiting' : 'off',
      headline: metaLast ? `${metaN} lead(s) do Meta nos últimos 30 dias, direto no funil.` : 'Os leads dos formulários dos anúncios ainda não chegam sozinhos.',
      lastAt: fmt(metaLast?.createdAt), metrics: [{ label: 'Leads (30 dias)', value: String(metaN) }],
      feeds: [{ label: 'Leads & Conversão', href: '/marketing/leads' }],
      next: metaLast ? null : 'Ligar pelo Make ou Zapier (não precisa do developers.facebook.com).', guide: 'meta-leads',
    },
    adsCard('meta-ads', 'Meta', 'Anúncios Meta (gasto e resultados)', env('META_ACCESS_TOKEN') && env('META_AD_ACCOUNT_ID'), meta, 'meta',
      'Por enquanto, lance o gasto em Tráfego Pago. Automático: conexão pela API do Meta (Guia).'),
    {
      key: 'wix-leads', platform: 'Wix', name: 'Formulários do site',
      status: siteLast && now.getTime() - siteLast.createdAt.getTime() <= 30 * DAY ? 'auto' : token ? 'waiting' : 'off',
      headline: siteLast ? `${siteN} lead(s) do site nos últimos 30 dias.` : token ? 'Endereço pronto — falta ligar a automação no Wix (ou ainda não houve envio).' : 'Falta criar a senha do webhook (CRON_SECRET) na Vercel.',
      lastAt: fmt(siteLast?.createdAt), metrics: [{ label: 'Leads (30 dias)', value: String(siteN) }],
      feeds: [{ label: 'Leads & Conversão', href: '/marketing/leads' }],
      next: siteLast ? null : 'Wix → Automações → “Formulário enviado” → webhook (Guia).', guide: 'wix',
    },
    {
      key: 'ga4', platform: 'Google', name: 'Google Analytics 4 (visitas do site)',
      status: env('GA4_PROPERTY_ID') && env('GOOGLE_SERVICE_ACCOUNT_JSON') ? 'waiting' : 'off',
      headline: env('GA4_PROPERTY_ID') && env('GOOGLE_SERVICE_ACCOUNT_JSON') ? 'Chaves configuradas — a leitura das visitas vai ser ligada.' : 'Visitas e origem do tráfego do site ainda não entram no sistema.',
      lastAt: null, metrics: [],
      feeds: [{ label: 'Performance', href: '/marketing/performance' }],
      next: 'Criar a chave de leitura e colar na Vercel (Guia).', guide: 'ga4',
    },
    adsCard('gads', 'Google', 'Google Ads (gasto e resultados)', env('GOOGLE_ADS_DEVELOPER_TOKEN') && env('GOOGLE_ADS_CUSTOMER_ID') && env('GOOGLE_ADS_REFRESH_TOKEN'), google, 'gads',
      'Por enquanto, lance o gasto em Tráfego Pago. Automático: token da API do Google Ads (Guia).'),
    {
      key: 'whatsapp', platform: 'WhatsApp', name: 'WhatsApp (Z-API)',
      status: !zapi.configured ? 'off' : zapi.testPhone ? 'waiting' : 'auto',
      headline: !zapi.configured ? 'Sem WhatsApp: comunicados só no mural.' : zapi.testPhone ? 'Modo teste ligado: tudo vai só para o número de teste.' : `${waSent} mensagem(ns) enviada(s) nos últimos 7 dias.`,
      lastAt: fmt(waLast?.createdAt),
      metrics: [{ label: 'Enviadas (7 dias)', value: String(waSent) }, ...(waFail ? [{ label: 'Falhas (7 dias)', value: String(waFail) }] : [])],
      feeds: [{ label: 'Comunicação Interna', href: '/marketing/interna' }, { label: 'Briefing', href: '/marketing/campanhas' }],
      next: !zapi.configured ? 'Configurar em Administração → WhatsApp.' : zapi.testPhone ? 'Apagar ZAPI_TEST_PHONE na Vercel e fazer Redeploy.' : null, guide: 'whatsapp',
    },
    {
      key: 'links', platform: 'Sistema', name: 'Links rastreados (bio, QR Code, WhatsApp)',
      status: linkLast && now.getTime() - linkLast.lastClickAt!.getTime() <= 30 * DAY ? 'auto' : 'waiting',
      headline: linkLast ? `${linkClicks._sum.clicks ?? 0} clique(s) nos últimos 30 dias.` : 'Nenhum clique ainda — use os links de Canais & Links na divulgação.',
      lastAt: fmt(linkLast?.lastClickAt), metrics: [{ label: 'Cliques (30 dias)', value: String(linkClicks._sum.clicks ?? 0) }],
      feeds: [{ label: 'Canais & Links', href: '/marketing/canais' }, { label: 'Performance', href: '/marketing/performance' }],
      next: linkLast ? null : 'Criar um link por canal em Canais & Links.', guide: null,
    },
    {
      key: 'ia', platform: 'Sistema', name: 'IA (Claude)',
      status: env('ANTHROPIC_API_KEY') ? 'auto' : 'off',
      headline: env('ANTHROPIC_API_KEY') ? `${aiN} sugestão(ões) da IA nos últimos 30 dias.` : 'Sem chave da IA.',
      lastAt: null, metrics: [],
      feeds: [{ label: 'IA Marketing', href: '/marketing/ia' }],
      next: env('ANTHROPIC_API_KEY') ? null : 'Criar ANTHROPIC_API_KEY na Vercel.', guide: 'ia',
    },
  ];
}
