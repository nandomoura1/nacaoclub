import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { audienceRecipients, deleteAutomation, listAutomations, previewAutomation, replyOverview, runAutomation, runDueAutomations, saveAutomation } from '@/server/whatsapp/automations';
import { handleZapiReceived } from '@/server/whatsapp/inbound';
import { POST } from '@/app/api/webhooks/zapi/route';
import { META, ensureCatalog, hasDb, makeArea, makeUser } from './helpers';

/** Automações contra uma Z-API falsa: destinatários, modelo, "uma vez por período" e respostas. */
describe.skipIf(!hasDb)('WhatsApp — automações', () => {
  const ENV = ['ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_TOKEN', 'ZAPI_BASE_URL', 'ZAPI_TEST_PHONE', 'ZAPI_FAKE', 'CRON_SECRET'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const sent: { phone: string; message: string }[] = [];
  let server: Server;
  const monday = '2031-03-03';
  const friday = '2031-03-07';
  const LIDERES = 'a0000000-0000-4000-8000-000000000001';
  const ESCALA = 'a0000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    await ensureCatalog();
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => { if (data) sent.push(JSON.parse(data)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"messageId":"m"}'); });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    for (const k of ENV) delete process.env[k];
    Object.assign(process.env, { ZAPI_INSTANCE_ID: 'I', ZAPI_INSTANCE_TOKEN: 'T', ZAPI_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` });
    await prisma.waAutomation.updateMany({ data: { lastPeriod: null } });
  });
  afterAll(() => { server.close(); for (const k of ENV) { delete process.env[k]; if (saved[k] !== undefined) process.env[k] = saved[k]; } });

  it('as 3 automações iniciais vieram da migration, editáveis', async () => {
    const list = await listAutomations();
    expect(list.filter((a) => a.id.startsWith('a0000000')).map((a) => [a.audience, a.when])).toEqual([
      ['LIDERES_PENDENCIAS', 'Toda segunda, 8h'], ['ESCALADOS_FDS', 'Toda sexta, 8h'], ['PROFESSORES_GRADE', 'Dia 1 de cada mês, 8h'],
    ]);
  });

  it('líderes: só quem tem pendência; não repete na semana; desligada não envia', async () => {
    const admin = await makeUser('ADMIN');
    const lider = await makeUser('LIDER', { name: 'Carla Líder' });
    const semNada = await makeUser('LIDER', { name: 'Davi Tranquilo' });
    await prisma.user.update({ where: { id: lider.principal.id }, data: { phone: '61 98888-1111' } });
    await prisma.user.update({ where: { id: semNada.principal.id }, data: { phone: '61 97777-2222' } });
    const tag = Math.random().toString(36).slice(2, 6);
    const s1 = await prisma.procSector.create({ data: { name: `Setor A ${tag}`, leaderId: lider.principal.id } });
    await prisma.procSector.create({ data: { name: `Setor B ${tag}`, leaderId: semNada.principal.id } });
    await prisma.procDemand.createMany({ data: [
      { sectorId: s1.id, title: 'Atrasada', dueDate: new Date('2031-02-25T00:00:00Z'), requesterId: admin.principal.id },
      { sectorId: s1.id, title: 'Vence na semana', dueDate: new Date('2031-03-06T00:00:00Z') },
      { sectorId: s1.id, title: 'Longe', dueDate: new Date('2031-04-30T00:00:00Z') },
    ] });
    sent.length = 0;
    const r = await runDueAutomations(monday);
    expect(r['Lembrete semanal aos líderes']).toMatchObject({ period: '2031-W10', enviados: 1 });
    const msg = sent.find((m) => m.phone === '5561988881111')!.message;
    expect(msg).toContain('Bom dia, Carla!');
    expect(msg).toContain('Atrasada');
    expect(msg).not.toContain('Longe');
    expect(sent.some((m) => m.phone === '5561977772222')).toBe(false);
    expect(await runAutomation(LIDERES, '2031-03-05')).toBeNull(); // não é segunda
    expect((await runDueAutomations('2031-03-03'))['Lembrete semanal aos líderes']).toBe('já enviada neste período');
    await prisma.waAutomation.update({ where: { id: LIDERES }, data: { active: false } });
    expect(await runAutomation(LIDERES, '2031-03-10')).toBeNull();
    await prisma.waAutomation.update({ where: { id: LIDERES }, data: { active: true } });
  });

  it('escala de sexta e modo teste limitado a 3', async () => {
    const area = await makeArea();
    const mod = await prisma.modality.create({ data: { name: `Mod ${Math.random().toString(36).slice(2, 7)}`, areaId: area.id } });
    const sector = await prisma.dutySector.create({ data: { name: `Recepção ${Math.random().toString(36).slice(2, 6)}`, modalityId: mod.id } });
    const [t1, t2] = await Promise.all([prisma.teacher.create({ data: { name: 'Eva Escala', phone: '61 96666-3333' } }), prisma.teacher.create({ data: { name: 'Fábio Sem Fone' } })]);
    await prisma.dutyShift.create({ data: { sectorId: sector.id, date: new Date('2031-03-08T00:00:00Z'), startMin: 420, endMin: 1020, people: { create: [{ teacherId: t1.id }, { teacherId: t2.id }] } } });
    expect((await audienceRecipients('ESCALADOS_FDS', null, friday)).map((x) => x.name).sort()).toEqual(['Eva Escala', 'Fábio Sem Fone']);
    sent.length = 0;
    expect(await runAutomation(ESCALA, friday)).toMatchObject({ enviados: 1, semTelefone: ['Fábio Sem Fone'] });
    expect(sent[0]!.message).toContain('Oi, Eva! Sua escala');
    expect(sent[0]!.message).toContain('sábado 08/03');
    process.env.ZAPI_TEST_PHONE = '61 95555-0000';
    sent.length = 0;
    expect(await runAutomation(ESCALA, friday, { force: true, actorName: 'Admin' })).toMatchObject({ manual: true, enviados: 1 });
    expect(sent.every((s) => s.phone === '5561955550000')).toBe(true);
    delete process.env.ZAPI_TEST_PHONE;
  });

  it('criar/editar: valida variáveis e filtros; números fixos; confirmação genérica pelo webhook', async () => {
    const admin = await makeUser('ADMIN');
    const coord = await makeUser('COORDENADOR');
    const base = { name: 'Aviso geral', active: true, frequency: 'SEMANAL', weekdays: [3], monthDay: null, audience: 'NUMEROS', filter: { numbers: ['61 94444-1234'] }, template: 'Reunião geral quinta às 14h. Confirma? *OK*', askConfirmation: true };
    await expect(saveAutomation(coord.principal, null, base, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(saveAutomation(admin.principal, null, { ...base, template: 'Oi {primeiro_nome}' }, META)).rejects.toThrow(/não preenche/);
    await expect(saveAutomation(admin.principal, null, { ...base, weekdays: [] }, META)).rejects.toThrow(/dia da semana/);
    await expect(saveAutomation(admin.principal, null, { ...base, filter: { numbers: ['123'] } }, META)).rejects.toThrow(/inválido/);
    const id = await saveAutomation(admin.principal, null, base, META);
    const pv = await previewAutomation({ audience: 'NUMEROS', filter: { numbers: ['61 94444-1234'] }, template: base.template }, '2031-03-05');
    expect(pv.amostras[0]!.texto).toContain('Reunião geral');

    sent.length = 0;
    expect(await runAutomation(id, '2031-03-05')).toMatchObject({ period: '2031-W10', enviados: 1 });
    expect(await handleZapiReceived({ type: 'ReceivedCallback', messageId: `x${id}`, phone: '556144441234', text: { message: 'ok 👍' } })).toBe('CONFIRMOU');
    expect(sent.at(-1)!.message).toContain('Confirmado ✅');
    const ov = await replyOverview();
    expect(ov.groups.find((g) => g.subject.startsWith('Aviso geral'))!.items[0]).toMatchObject({ status: 'CONFIRMADO' });

    await saveAutomation(admin.principal, id, { ...base, name: 'Aviso geral 2', audience: 'PERFIL', filter: { roleKey: 'COORDENADOR' }, template: 'Oi {primeiro_nome}!' }, META);
    expect((await listAutomations()).find((a) => a.id === id)).toMatchObject({ name: 'Aviso geral 2', filter: { roleKey: 'COORDENADOR' } });
    await deleteAutomation(admin.principal, id, META);
    expect((await listAutomations()).some((a) => a.id === id)).toBe(false);
  });

  it('respostas: duplicada e própria são ignoradas; ajuste e depois ok; webhook exige token', async () => {
    const tag = Math.random().toString(36).slice(2, 6);
    const h = await prisma.teacher.create({ data: { name: `Hugo ${tag}`, phone: '61 93333-5678' } });
    await prisma.waConfirmation.create({ data: { kind: 'a0000000-0000-4000-8000-000000000003', period: '2031-03', recipientKey: `t:${h.id}`, teacherId: h.id, name: h.name, subject: 'Grade mensal · março de 2031', phoneKey: '6133335678' } });
    expect(await handleZapiReceived({ type: 'ReceivedCallback', messageId: `d${tag}`, phone: '5561933335678', text: { message: 'Terça não posso mais às 7h' } })).toBe('AJUSTE');
    expect(await handleZapiReceived({ type: 'ReceivedCallback', messageId: `d${tag}`, phone: '5561933335678', text: { message: 'x' } })).toBe('duplicada');
    expect(await handleZapiReceived({ type: 'ReceivedCallback', messageId: `e${tag}`, phone: '5561933335678', fromMe: true, text: { message: 'ok' } })).toBe('ignorada');
    expect(await handleZapiReceived({ type: 'ReceivedCallback', messageId: `f${tag}`, phone: '5561933335678', text: { message: 'ok' } })).toBe('CONFIRMOU');
    const c = await prisma.waConfirmation.findFirstOrThrow({ where: { teacherId: h.id } });
    expect([c.status, c.reply]).toEqual(['CONFIRMADO', 'Terça não posso mais às 7h']);

    process.env.CRON_SECRET = 'segredo-teste';
    const call = (token: string) => POST(new Request(`http://x/api/webhooks/zapi?token=${token}`, { method: 'POST', body: JSON.stringify({ type: 'ReceivedCallback', messageId: `g${tag}`, phone: '5561999990000', text: { message: 'oi' } }) }));
    expect((await call('errado')).status).toBe(401);
    expect(await (await call('segredo-teste')).json()).toMatchObject({ ok: true, result: 'registrada' });
  });
});
