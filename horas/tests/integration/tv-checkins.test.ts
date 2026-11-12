import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { weekdayOf, toUtc } from '@/domain/dates';
import { setFakeTecnofit } from '@/server/tecnofit/client';
import { FakeTecnofit, type FakeData } from '@/server/tecnofit/fake';
import { checkinsByToken, listClassLinks, refreshCheckins, saveClassLink, setHidden, todayCheckins } from '@/server/services/tv-checkin-service';
import { listScreens, saveScreen, setScreenCheckins } from '@/server/services/tv-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Check-ins na TV: Tecnofit (simulada) → aula atual da grade → só "Nome I." na TV, com opt-out. */
describe.skipIf(!hasDb)('Check-ins na TV', () => {
  const day = '2041-03-04';
  const at = (hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);
  const data: FakeData = {
    customers: [], consultants: [], calls: [],
    classes: [{ id: '77', name: 'CROSSFIT TESTE CHECKIN 07H', modality: 'CrossFit', place: 'Box 1' }, { id: '78', name: 'Pilates', modality: 'Bem-estar', place: null }],
    schedule: [
      { eventId: '501', classId: '77', name: 'CROSSFIT TESTE CHECKIN 07H', date: day, startTime: '07:00', endTime: '08:00', modality: 'CrossFit', place: 'Box 1', capacity: 20, occupied: 3 },
      { eventId: '502', classId: '77', name: 'CROSSFIT TESTE CHECKIN 07H', date: day, startTime: '08:00', endTime: '09:00', modality: 'CrossFit', place: 'Box 1', capacity: 20, occupied: 1 },
    ],
    checkins: [
      // O id no check-in é o do EVENTO do dia (501): a agenda leva para a turma 77.
      { type: 'crossfit', date: day, customerId: '9101', customerName: 'ANA MARIA DE SOUZA', classId: '501', className: 'CROSSFIT', classStart: `${day} 07:00:00`, checkinAt: `${day} 06:40:00` },
      { type: 'class', date: day, customerId: '9102', customerName: 'Bruno Lima', classId: '77', className: 'CROSSFIT', classStart: `${day} 07:00:00`, checkinAt: `${day} 06:45:00` },
      { type: 'crossfit', date: day, customerId: '9103', customerName: 'Carla Prado', classId: '77', className: 'CROSSFIT', classStart: `${day} 07:00:00`, checkinAt: `${day} 06:50:00` },
      { type: 'crossfit', date: day, customerId: '9104', customerName: 'Davi Rocha', classId: '502', className: 'CROSSFIT', classStart: `${day} 08:00:00`, checkinAt: `${day} 06:55:00` }, // outra aula
    ],
  };
  let calls = 0;
  class Spy extends FakeTecnofit { override async checkinsPage(d: string, t: 'class' | 'crossfit', p: number) { calls++; return super.checkinsPage(d, t, p); } }
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;
  let modalityId = ''; let token = ''; let screenId = '';
  const prev = process.env.TECNOFIT_FAKE;

  beforeAll(async () => {
    process.env.TECNOFIT_FAKE = '1';
    await ensureCatalog();
    setFakeTecnofit(() => new Spy(data));
    admin = await makeUser('ADMIN'); lider = await makeUser('LIDER'); prof = await makeUser('PROFESSOR');
    const area = await prisma.coordinationArea.create({ data: { name: `Área TV ${randomUUID().slice(0, 6)}` } });
    modalityId = (await prisma.modality.create({ data: { name: "CrossFit Teste Checkin", areaId: area.id } })).id;
    const act = await prisma.activityType.upsert({ where: { name: 'Aula' }, create: { name: 'Aula', kind: 'AULA' }, update: {} });
    for (const startMin of [420, 480]) {
      const slot = await prisma.scheduleSlot.create({ data: {} });
      await prisma.scheduleSlotVersion.create({ data: { slotId: slot.id, weekday: weekdayOf(day), startMin, durationMin: 60, modalityId, activityTypeId: act.id, validFrom: toUtc('2041-01-01') } });
    }
    screenId = await saveScreen(admin.principal, null, { name: 'TV do box teste', modalityId }, META);
    token = (await listScreens(admin.principal)).find((s) => s.id === screenId)!.token;
    await prisma.tvCheckin.deleteMany({}); await prisma.tvCheckinSync.deleteMany({}); await prisma.tecClassSlot.deleteMany({});
  });
  afterAll(() => { setFakeTecnofit(null); process.env.TECNOFIT_FAKE = prev; });

  it('tela nova e as que já existem: check-in desligado (a TV não muda até alguém ligar)', async () => {
    expect(await checkinsByToken(token, at('07:05'))).toMatchObject({ active: false });
    expect(calls).toBe(0);
    await expect(setScreenCheckins(prof.principal, screenId, { showCheckins: true, spaceId: null }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await setScreenCheckins(admin.principal, screenId, { showCheckins: true, spaceId: null }, META);
  });

  it('aula agora sem turma vinculada: avisa "ainda não ligado" e nem consulta a Tecnofit', async () => {
    const v = (await checkinsByToken(token, at('07:05')))!;
    expect(v).toMatchObject({ active: true, configured: false, labels: [] });
    expect(v.title).toMatch(/^07:00 · CrossFit Teste Checkin/);
    expect(calls).toBe(0);
  });

  it('vínculo da turma (com sugestão pelo nome) e a TV mostra só "Nome I." da aula atual', async () => {
    const l = await listClassLinks(admin.principal);
    expect(l.rows.find((r) => r.tecnofitClassId === '77')!.suggestion).toBe(modalityId);
    await expect(saveClassLink(prof.principal, { tecnofitClassId: '77', name: 'x', modalityId, spaceId: null }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await saveClassLink(admin.principal, { tecnofitClassId: '77', name: 'CROSSFIT TESTE CHECKIN 07H', modalityId, spaceId: null }, META);
    const v = (await checkinsByToken(token, at('07:05')))!;
    expect(v).toMatchObject({ active: true, configured: true, count: 3, capacity: 20 });
    expect(v.labels).toEqual(['Ana S.', 'Bruno L.', 'Carla P.']);
    // Nada além do rótulo sai para a TV.
    expect(JSON.stringify(v)).not.toMatch(/SOUZA|Lima|Prado|9101|06:40/);
    // Às 7h50 a aula atual já é a das 8h.
    expect((await checkinsByToken(token, at('07:50')))!.labels).toEqual(['Davi R.']);
  });

  it('uma consulta por minuto para todas as TVs', async () => {
    const before = calls;
    expect(await refreshCheckins(day, at('07:50'))).toBe(false); // a TV acabou de consultar às 07h50
    await checkinsByToken(token, at('07:50'));
    expect(calls).toBe(before);
    expect(await refreshCheckins(day, at('07:52'))).toBe(true);
  });

  it('não quer aparecer: a recepção marca, some da TV mas continua contando; dá para desfazer', async () => {
    await expect(todayCheckins(prof.principal, at('07:53'))).rejects.toBeInstanceOf(AuthorizationError);
    const t = await todayCheckins(lider.principal, at('07:53'));
    expect(t.groups.flatMap((g) => g.people.map((p) => p.name))).toContain('Bruno Lima');
    await setHidden(lider.principal, { customerTecId: '9102', hidden: true }, META);
    const v7 = (await checkinsByToken(token, at('07:04')))!;
    expect(v7.labels).toEqual(['Ana S.', 'Carla P.']);
    expect(v7.count).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'tv.hidden', entityId: '9102' } })).toBe(1);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'tv.hidden', entityId: '9102' } })).summary).not.toContain('Lima');
    await setHidden(lider.principal, { customerTecId: '9102', hidden: false }, META);
    expect((await checkinsByToken(token, at('07:05')))!.labels).toContain('Bruno L.');
  });

  it('fora do horário de aula a faixa some; dados de dias anteriores são apagados', async () => {
    expect(await checkinsByToken(token, at('12:00'))).toMatchObject({ active: false });
    await refreshCheckins('2041-03-05', new Date('2041-03-05T10:05:00Z'));
    expect(await prisma.tvCheckin.count({ where: { day: toUtc(day) } })).toBe(0);
  });
});
