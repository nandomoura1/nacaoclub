import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { prisma } from '@/server/db';
import { jobRecipients, runWaJob } from '@/server/whatsapp/jobs';
import { ensureCatalog, hasDb, makeArea, makeUser } from './helpers';

/** Envios automáticos contra uma Z-API falsa: destinatários, texto e "uma vez por período". */
describe.skipIf(!hasDb)('WhatsApp — envios automáticos', () => {
  const ENV = ['ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_TOKEN', 'ZAPI_BASE_URL', 'ZAPI_TEST_PHONE', 'ZAPI_FAKE'] as const;
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const sent: { phone: string; message: string }[] = [];
  let server: Server;
  const monday = '2031-03-03';
  const friday = '2031-03-07';

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
    await prisma.waJob.deleteMany();
  });
  afterAll(() => { server.close(); for (const k of ENV) { delete process.env[k]; if (saved[k] !== undefined) process.env[k] = saved[k]; } });

  it('líderes: só quem tem pendência, com o telefone do usuário; não repete na mesma semana; desligado não envia', async () => {
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
      { sectorId: s1.id, title: 'Feita', dueDate: new Date('2031-02-20T00:00:00Z'), status: 'CONCLUIDA' },
    ] });

    const r = await runWaJob('LIDERES', monday);
    expect(r).toMatchObject({ period: '2031-W10', enviados: 1, falhas: 0 });
    const msg = sent.find((m) => m.phone === '5561988881111')!.message;
    expect(msg).toContain('Atrasada');
    expect(msg).toContain('Vence na semana');
    expect(msg).not.toContain('Longe');
    expect(msg).not.toContain('Feita');
    expect(sent.some((m) => m.phone === '5561977772222')).toBe(false);
    expect(await runWaJob('LIDERES', '2031-03-05')).toBeNull(); // mesma semana

    await prisma.waJob.update({ where: { key: 'LIDERES' }, data: { enabled: false } });
    expect(await runWaJob('LIDERES', '2031-03-10')).toBeNull();
    expect(await prisma.waMessage.count({ where: { kind: 'DEMANDAS', createdById: null } })).toBeGreaterThanOrEqual(1);
  });

  it('escala de sexta: cada professor recebe os próprios turnos; sem telefone fica listado; modo teste limita a 3', async () => {
    const area = await makeArea();
    const mod = await prisma.modality.create({ data: { name: `Mod ${Math.random().toString(36).slice(2, 7)}`, areaId: area.id } });
    const sector = await prisma.dutySector.create({ data: { name: `Recepção ${Math.random().toString(36).slice(2, 6)}`, modalityId: mod.id } });
    const [t1, t2] = await Promise.all([
      prisma.teacher.create({ data: { name: 'Eva Escala', phone: '61 96666-3333' } }),
      prisma.teacher.create({ data: { name: 'Fábio Sem Fone' } }),
    ]);
    await prisma.dutyShift.create({ data: { sectorId: sector.id, date: new Date('2031-03-08T00:00:00Z'), startMin: 420, endMin: 1020, people: { create: [{ teacherId: t1.id }, { teacherId: t2.id }] } } });
    await prisma.dutyShift.create({ data: { sectorId: sector.id, date: new Date('2031-03-10T00:00:00Z'), startMin: 480, endMin: 720, people: { create: [{ teacherId: t1.id }] } } }); // segunda sem feriado: fora

    const list = await jobRecipients('ESCALA_FDS', friday);
    expect(list.map((x) => x.name).sort()).toEqual(['Eva Escala', 'Fábio Sem Fone']);
    sent.length = 0;
    const r = await runWaJob('ESCALA_FDS', friday);
    expect(r).toMatchObject({ period: '2031-03-08', enviados: 1, semTelefone: ['Fábio Sem Fone'] });
    expect(sent[0]!.message).toContain('sábado 08/03');
    expect(sent[0]!.message).not.toContain('10/03');

    // Manual, em modo teste: vai para o número de teste e no máximo 3.
    process.env.ZAPI_TEST_PHONE = '61 95555-0000';
    sent.length = 0;
    const m = await runWaJob('ESCALA_FDS', friday, { force: true, actorName: 'Admin' });
    expect(m).toMatchObject({ manual: true, enviados: 1 });
    expect(sent.every((s) => s.phone === '5561955550000')).toBe(true);
    delete process.env.ZAPI_TEST_PHONE;
  });
});
