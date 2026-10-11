import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { sendWhatsApp, whatsAppOverview } from '@/server/services/whatsapp-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Z-API simulada (ZAPI_FAKE) e um servidor HTTP falso para conferir o formato das chamadas. */
describe.skipIf(!hasDb)('WhatsApp (Z-API)', () => {
  const ENV = ['ZAPI_FAKE', 'ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_TOKEN', 'ZAPI_CLIENT_TOKEN', 'ZAPI_TEST_PHONE', 'ZAPI_BASE_URL'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let coord: Awaited<ReturnType<typeof makeUser>>;
  let server: Server;
  let port = 0;
  const calls: { method: string; url: string; headers: Record<string, unknown>; body: unknown }[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: { zaapId: 'z1', messageId: 'm1' } };

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Zap' });
    coord = await makeUser('COORDENADOR', { name: 'Coord Zap' });
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        calls.push({ method: req.method!, url: req.url!, headers: req.headers, body: data ? JSON.parse(data) : null });
        res.writeHead(req.url!.endsWith('/status') ? 200 : reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(req.url!.endsWith('/status') ? { connected: true, smartphoneConnected: true } : reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
  });
  afterEach(() => { for (const k of ENV) delete process.env[k]; calls.length = 0; });
  afterAll(() => { server.close(); for (const k of ENV) if (saved[k] !== undefined) process.env[k] = saved[k]; });

  it('sem configuração: recusa com mensagem clara; professor não envia', async () => {
    await expect(sendWhatsApp(admin.principal, { kind: 'TESTE', to: '61 98466-2806', text: 'oi' }, META)).rejects.toThrow(/não configurado/);
    const prof = await makeUser('PROFESSOR', { name: 'Prof Zap' });
    await expect(sendWhatsApp(prof.principal, { kind: 'TESTE', to: '61 98466-2806', text: 'oi' }, META)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('chama a Z-API no formato certo (send-text, Client-Token) e registra mascarado', async () => {
    Object.assign(process.env, { ZAPI_INSTANCE_ID: 'INST', ZAPI_INSTANCE_TOKEN: 'TOK', ZAPI_CLIENT_TOKEN: 'SEC', ZAPI_BASE_URL: `http://127.0.0.1:${port}` });
    const r = await sendWhatsApp(coord.principal, { kind: 'ESCALA', to: '(61) 98466-2806', text: 'Escala do sábado' }, META);
    expect(r).toEqual({ status: 'SENT', testMode: false, to: '(61) 9••••-2806' });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/instances/INST/token/TOK/send-text', body: { phone: '5561984662806', message: 'Escala do sábado' } });
    expect(calls[0]!.headers['client-token']).toBe('SEC');
    const m = await prisma.waMessage.findFirstOrThrow({ where: { createdById: coord.principal.id }, orderBy: { createdAt: 'desc' } });
    expect([m.status, m.toMasked, m.providerId, m.preview]).toEqual(['SENT', '(61) 9••••-2806', 'm1', 'Escala do sábado']);
    expect(await prisma.auditLog.count({ where: { entityId: m.id, action: 'whatsapp.sent' } })).toBe(1);

    const o = await whatsAppOverview(admin.principal);
    expect(o.status).toEqual({ connected: true, smartphoneConnected: true, error: null });
    await expect(whatsAppOverview(coord.principal)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('modo teste redireciona tudo; senha não fica no registro; acesso só para quem gerencia usuários', async () => {
    Object.assign(process.env, { ZAPI_INSTANCE_ID: 'INST', ZAPI_INSTANCE_TOKEN: 'TOK', ZAPI_BASE_URL: `http://127.0.0.1:${port}`, ZAPI_TEST_PHONE: '61 99999-0000' });
    await expect(sendWhatsApp(coord.principal, { kind: 'ACESSO', to: '61 98466-2806', text: 'Senha: X', hasSecret: true }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const r = await sendWhatsApp(admin.principal, { kind: 'ACESSO', to: '61 98466-2806', text: 'Senha temporária: *Abc*', hasSecret: true }, META);
    expect(r.testMode).toBe(true);
    const body = calls.at(-1)!.body as { phone: string; message: string };
    expect(body.phone).toBe('5561999990000');
    expect(body.message).toMatch(/^🧪 \[TESTE — seria para \(61\) 9••••-2806\]/);
    expect(calls.at(-1)!.headers['client-token']).toBeUndefined();
    const m = await prisma.waMessage.findFirstOrThrow({ where: { createdById: admin.principal.id, kind: 'ACESSO' }, orderBy: { createdAt: 'desc' } });
    expect([m.preview, m.testMode]).toEqual([null, true]);
  });

  it('falha da Z-API vira erro claro e fica registrada como falhou', async () => {
    Object.assign(process.env, { ZAPI_INSTANCE_ID: 'INST', ZAPI_INSTANCE_TOKEN: 'TOK', ZAPI_BASE_URL: `http://127.0.0.1:${port}` });
    reply = { status: 401, body: { error: 'your client-token is not configured' } };
    await expect(sendWhatsApp(admin.principal, { kind: 'TESTE', to: '61 98466-2806', text: 'x' }, META)).rejects.toThrow(/recusou as credenciais/);
    reply = { status: 200, body: { zaapId: 'z1', messageId: 'm1' } };
    const m = await prisma.waMessage.findFirstOrThrow({ where: { createdById: admin.principal.id, status: 'FAILED' } });
    expect(m.error).toMatch(/credenciais/);
  });

  it('PDF vai em send-document/pdf como base64 com legenda', async () => {
    Object.assign(process.env, { ZAPI_INSTANCE_ID: 'INST', ZAPI_INSTANCE_TOKEN: 'TOK', ZAPI_BASE_URL: `http://127.0.0.1:${port}` });
    await sendWhatsApp(admin.principal, { kind: 'CONDOMINIO', to: '61 98466-2806', text: 'Cobrança' }, META, { bytes: new Uint8Array([37, 80, 68, 70]), fileName: 'c.pdf' });
    expect(calls.at(-1)).toMatchObject({ url: '/instances/INST/token/TOK/send-document/pdf', body: { phone: '5561984662806', document: 'data:application/pdf;base64,JVBERg==', fileName: 'c.pdf', caption: 'Cobrança' } });
  });

  it('modo simulação (desenvolvimento)', async () => {
    process.env.ZAPI_FAKE = '1';
    expect((await sendWhatsApp(admin.principal, { kind: 'TESTE', to: '61 98466-2806', text: 'oi' }, META)).status).toBe('SIMULATED');
    expect(calls.length).toBe(0);
  });
});
