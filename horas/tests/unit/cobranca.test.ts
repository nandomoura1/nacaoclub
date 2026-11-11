import { describe, expect, it } from 'vitest';
import { agingOf, cadenceStep, isCollectible, isoFromApi, maskMobile, money, pickMobile, priorityScore } from '@/domain/cobranca';
import { collectibleDebts } from '@/server/services/crm-sync-service';
import { HttpTecnofit, tecnofitConfig } from '@/server/tecnofit/client';
import { SYSTEM_ROLES } from '@/server/auth/permissions';

const today = '2026-11-11';

describe('Cobrança: regras puras', () => {
  it('cobrável = valor em aberto com vencimento até D+3', () => {
    const base = { saleId: '1', totalValue: 100, description: 'x' };
    expect(isCollectible({ ...base, dueDate: '2026-11-01', openValue: 100 }, today)).toBe(true);
    expect(isCollectible({ ...base, dueDate: '2026-11-14', openValue: 100 }, today)).toBe(true);
    expect(isCollectible({ ...base, dueDate: '2026-11-15', openValue: 100 }, today)).toBe(false);
    expect(isCollectible({ ...base, dueDate: '2026-11-01', openValue: 0 }, today)).toBe(false);
    expect(isCollectible({ ...base, dueDate: null, openValue: 50 }, today)).toBe(false);
  });

  it('régua: D-3, D0, D+3, D+5, D+7 e D+15', () => {
    expect(cadenceStep('2026-11-20', today)).toBeNull();
    expect(cadenceStep('2026-11-14', today)?.offset).toBe(-3);
    expect(cadenceStep('2026-11-11', today)?.offset).toBe(0);
    expect(cadenceStep('2026-11-08', today)?.offset).toBe(3);
    expect(cadenceStep('2026-11-06', today)?.offset).toBe(5);
    expect(cadenceStep('2026-11-01', today)?.offset).toBe(7);
    expect(cadenceStep('2026-10-20', today)?.offset).toBe(15);
  });

  it('faixas de atraso', () => {
    expect(agingOf(-2)).toBe('A_VENCER');
    expect(agingOf(0)).toBe('A_VENCER');
    expect(agingOf(7)).toBe('1_7');
    expect(agingOf(8)).toBe('8_15');
    expect(agingOf(61)).toBe('60P');
  });

  it('celular: prefere WhatsApp, depois celular; ignora fixo; tira o 55', () => {
    expect(pickMobile([{ contact: '(61) 3333-0000', type: 'TELEFONE FIXO' }])).toBeNull();
    expect(pickMobile([{ contact: '(61) 99999-1111', type: 'TELEFONE CELULAR' }, { contact: '+55 61 98888-2222', type: 'WHATSAPP' }])).toBe('61988882222');
    expect(pickMobile([{ contact: '61 97777-3333', type: null }])).toBe('61977773333');
    expect(maskMobile('61988882222')).toBe('(61) 9••••-2222');
  });

  it('prioridade: mais atraso × valor primeiro; pendência depois', () => {
    const a = priorityScore({ kind: 'COBRANCA', openValue: 300, oldestDue: '2026-10-01', openedOn: today }, today);
    const b = priorityScore({ kind: 'COBRANCA', openValue: 300, oldestDue: '2026-11-08', openedOn: today }, today);
    const p = priorityScore({ kind: 'PENDENCIA', openValue: 0, oldestDue: null, openedOn: '2026-10-01' }, today);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(p);
  });

  it('formatos da API: valores e datas tolerantes', () => {
    expect(money('289.90')).toBe(289.9);
    expect(money(null)).toBe(0);
    expect(isoFromApi('2026-11-10 00:00:00')).toBe('2026-11-10');
    expect(isoFromApi('10/11/2026')).toBe('2026-11-10');
    expect(collectibleDebts([
      { id: '1', totalValue: 300, openValue: 100, saleDate: '2026-10-01', dueDate: '2026-11-01', items: [{ name: 'Plano' }] },
      { id: '2', totalValue: 300, openValue: 0, saleDate: '2026-10-01', dueDate: '2026-11-01' },
    ], today)).toEqual([{ saleId: '1', dueDate: '2026-11-01', openValue: 100, totalValue: 300, description: 'Plano' }]);
  });

  it('papéis de CRM: consultor sem visão do time; líder vê tudo mas não configura', () => {
    expect(SYSTEM_ROLES.CRM.permissions).not.toContain('crm.view_all');
    expect(SYSTEM_ROLES.CRM_LIDER.permissions).toContain('crm.view_all');
    expect(SYSTEM_ROLES.CRM_LIDER.permissions).not.toContain('crm.admin');
    expect(SYSTEM_ROLES.ADMIN.permissions).toContain('crm.admin');
  });
});

describe('Cliente HTTP da Tecnofit', () => {
  it('loga com as chaves no corpo, usa Bearer, pagina e não manda segredo na URL', async () => {
    process.env.TECNOFIT_API_KEY = 'pk_tf_teste_123456789';
    process.env.TECNOFIT_API_SECRET = 'sk_tf_teste_1234567890123';
    const seen: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      seen.push({ url: u, init });
      if (u.endsWith('/v1/auth/login')) return new Response(JSON.stringify({ token: 'jwt-1', token_type: 'Bearer', expiration_at: new Date(Date.now() + 3_600_000).toISOString() }), { status: 200 });
      const page = Number(new URL(u).searchParams.get('page'));
      return new Response(JSON.stringify({ data: [{ contact: `(61) 9999${page}-0000`, type: 'WHATSAPP' }], meta: { total: 2, page, limit_per_page: 1, pages: 2 } }), { status: 200 });
    }) as typeof fetch;
    try {
      const api = new HttpTecnofit(tecnofitConfig(), fake, 0);
      const contacts = await api.customerContacts('42');
      expect(contacts).toHaveLength(2);
      expect(seen[0]!.init?.method).toBe('POST');
      expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ api_key: 'pk_tf_teste_123456789', api_secret: 'sk_tf_teste_1234567890123' });
      expect((seen[1]!.init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
      expect(seen.filter((s) => s.url.endsWith('/auth/login'))).toHaveLength(1); // token reaproveitado
      expect(seen.every((s) => !s.url.includes('sk_tf') && !s.url.includes('pk_tf'))).toBe(true);
      expect(api.calls_made).toBe(3);
    } finally {
      delete process.env.TECNOFIT_API_KEY;
      delete process.env.TECNOFIT_API_SECRET;
    }
  });

  it('ligações do CRM: janelas de 30 dias; 422 cai para 7 dias e o motivo da Tecnofit aparece no erro', async () => {
    process.env.TECNOFIT_API_KEY = 'pk_tf_teste_123456789';
    process.env.TECNOFIT_API_SECRET = 'sk_tf_teste_1234567890123';
    const ranges: string[] = [];
    const fake = (async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/auth/login')) return new Response(JSON.stringify({ token: 't', expiration_at: new Date(Date.now() + 3_600_000).toISOString() }));
      const a = u.searchParams.get('startDate')!; const b = u.searchParams.get('endDate')!;
      const days = (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
      ranges.push(`${a}..${b}`);
      if (days > 7) return new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'período máximo de 7 dias' }), { status: 422 });
      return new Response(JSON.stringify({ data: [{ customer: { id: 1, name: 'X' }, consultant: { id: 9, name: 'C' }, status: 'completed', callDate: `${a} 10:00:00`, callDeadline: a }], meta: { pages: 1 } }));
    }) as typeof fetch;
    try {
      const api = new HttpTecnofit(tecnofitConfig(), fake, 0);
      const calls = await api.calls('2026-11-01', '2026-11-30');
      expect(ranges[0]).toBe('2026-11-01..2026-11-30');
      expect(calls).toHaveLength(5); // 30 dias em janelas de 7
      expect(calls[0]).toMatchObject({ customerId: '1', consultantId: '9', done: true, doneAt: '2026-11-01 10:00:00' });
      const other = (async (url: string | URL) => (String(url).endsWith('/auth/login')
        ? new Response(JSON.stringify({ token: 't' }))
        : new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'consultantId inválido' }), { status: 400 }))) as typeof fetch;
      await expect(new HttpTecnofit(tecnofitConfig(), other, 0).calls('2026-11-01', '2026-11-05')).rejects.toThrow(/400 em \/crm\/calls \(VALIDATION_ERROR · consultantId inválido\)/);
    } finally {
      delete process.env.TECNOFIT_API_KEY;
      delete process.env.TECNOFIT_API_SECRET;
    }
  });

  it('sem chaves: erro claro, sem chamar a rede', async () => {
    let called = false;
    const api = new HttpTecnofit(tecnofitConfig(), (async () => { called = true; return new Response('{}'); }) as typeof fetch, 0);
    await expect(api.consultants()).rejects.toThrow(/TECNOFIT_API_KEY/);
    expect(called).toBe(false);
  });
});
