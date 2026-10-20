import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { addDays } from '@/domain/dates';
import {
  calendarEntries, commandCenter, getCampaign, listCampaigns, reschedule, saveAreaOwners, saveCampaign, saveEvent, setCampaignStatus,
} from '@/server/services/marketing-service';
import { board, moveTask, saveTask, setDependencies } from '@/server/services/mkt-task-service';
import { createMeeting, decideMinutes, decideRecommendation, decideTaskSuggestion, generateMinutes, getMeeting, refreshRecommendations, suggestCampaignTasks } from '@/server/services/mkt-ai-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** Marketing Nação — Fase 1 (IA em modo exemplo; datas no futuro distante para não colidir). */
describe.skipIf(!hasDb)('Marketing Nação — Fase 1', () => {
  const prev = process.env.AI_FAKE;
  const year = 2200 + Math.floor(Math.random() * 700);
  const today = `${year}-03-01`;
  const start = addDays(today, 30);
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let campaignId = '';
  const tag = randomUUID().slice(0, 6);

  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    admin = await makeUser('ADMIN', { name: 'Admin Mkt' });
    mkt = await makeUser('MARKETING', { name: `Paulo Design ${tag}` });
    // Áreas existem pela migration; garante em banco de teste novo.
    for (const [i, key] of ['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL'].entries()) {
      await prisma.mktArea.upsert({ where: { key }, create: { key, name: key, color: '#0169E9', sortOrder: i }, update: {} });
    }
    const design = await prisma.mktArea.findUniqueOrThrow({ where: { key: 'DESIGN' } });
    await saveAreaOwners(admin.principal, design.id, mkt.principal.id, [], META);
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('Nação Celebration: evento em 30 dias → IA sugere → aceitar parte → Kanban/calendário com área e responsável', async () => {
    const eventId = await saveEvent(mkt.principal, null, { name: `Nação Celebration ${tag}`, startDate: start, location: 'Arena', status: 'CONFIRMADO' }, META);
    campaignId = await saveCampaign(mkt.principal, null, {
      name: `Nação Celebration ${tag}`, type: 'EVENTO', objective: 'Lotar o evento', audience: 'Alunos e famílias', message: 'Celebre com a Nação',
      cta: 'Inscreva-se', channels: ['ig_feed', 'ig_reels', 'tecnofit', 'whatsapp'], startDate: start, ownerId: mkt.principal.id, eventId,
    }, META);

    const sid = await suggestCampaignTasks(mkt.principal, campaignId, today, META);
    const s = await prisma.mktAiSuggestion.findUniqueOrThrow({ where: { id: sid } });
    const tarefas = (s.payload as { tarefas: { area: string; titulo: string }[] }).tarefas;
    expect(tarefas.length).toBeGreaterThanOrEqual(20);
    expect(s.status).toBe('PENDENTE');
    expect(await prisma.mktTask.count({ where: { campaignId } })).toBe(0); // nada criado sem aceite

    // Aceita as 20 primeiras, recusa o resto; a 1ª com título editado.
    const decisions = tarefas.map((_, i) => ({ index: i, accept: i < 20, ...(i === 0 ? { title: 'Conceito final da Celebration' } : {}) }));
    const r = await decideTaskSuggestion(mkt.principal, sid, decisions, today, META);
    expect(r).toEqual({ created: 20, status: 'PARCIAL' });
    const tasks = await prisma.mktTask.findMany({ where: { campaignId }, include: { area: true } });
    expect(tasks).toHaveLength(20);
    expect(tasks.every((t) => t.origin === 'IA' && t.dueDate && t.dueDate.toISOString().slice(0, 10) >= today)).toBe(true);
    expect(tasks.filter((t) => t.area?.key === 'DESIGN').every((t) => t.assigneeId === mkt.principal.id)).toBe(true); // responsável padrão da área
    expect(tasks.some((t) => t.title === 'Conceito final da Celebration')).toBe(true);
    await expect(decideTaskSuggestion(mkt.principal, sid, decisions, today, META)).rejects.toThrow(/já foi decidida/);

    const v = await getCampaign(mkt.principal, campaignId, today);
    expect(v.readiness.score).toBeGreaterThan(80);
    expect(v.history.some((h) => /aceitou 20 de/.test(h.summary))).toBe(true);
    const cal = await calendarEntries(mkt.principal, today, addDays(start, 10));
    expect(cal.filter((e) => e.kind === 'tarefa' && e.campaignId === campaignId)).toHaveLength(20);
    expect(cal.some((e) => e.kind === 'evento' && e.id === eventId)).toBe(true);
    expect((await board(mkt.principal, today, { campaignId })).tasks.length).toBe(20);
  });

  it('aceite em lote é atômico: uma tarefa inválida não grava nenhuma', async () => {
    const sid = await suggestCampaignTasks(mkt.principal, campaignId, today, META);
    const n = await prisma.mktTask.count({ where: { campaignId } });
    await expect(decideTaskSuggestion(mkt.principal, sid, [{ index: 0, accept: true }, { index: 1, accept: true, title: 'x' }], today, META)).rejects.toThrow(/título/);
    await expect(decideTaskSuggestion(mkt.principal, sid, [{ index: 0, accept: true }, { index: 9999, accept: true }], today, META)).rejects.toThrow(/inválida/);
    expect(await prisma.mktTask.count({ where: { campaignId } })).toBe(n);
    expect((await prisma.mktAiSuggestion.findUniqueOrThrow({ where: { id: sid } })).status).toBe('PENDENTE');
  });

  it('trava comercial e aprovação: Marketing não ativa; Admin só ativa com conversão completa', async () => {
    const id = await saveCampaign(mkt.principal, null, { name: `Renovação ${tag}`, type: 'RENOVACAO', cta: 'Renove', offer: '10% off', startDate: addDays(today, 10) }, META);
    await expect(setCampaignStatus(mkt.principal, id, 'ATIVA', META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setCampaignStatus(admin.principal, id, 'ATIVA', META)).rejects.toThrow(/canal de conversão.*responsável pelo lead.*forma de medir/);
    const v = await getCampaign(admin.principal, id, today);
    await saveCampaign(admin.principal, id, { ...v.data, conversionChannel: 'landing', conversionUrl: 'https://nacao.club/renova', leadOwnerId: admin.principal.id, measurement: 'UTM + código', endDate: v.data.endDate ?? '' }, META);
    await setCampaignStatus(admin.principal, id, 'ATIVA', META);
    // Ativa não perde a trava ao editar.
    const v2 = await getCampaign(admin.principal, id, today);
    await expect(saveCampaign(admin.principal, id, { ...v2.data, conversionUrl: '', endDate: v2.data.endDate ?? '' }, META)).rejects.toThrow(/ativa precisa manter/);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'mkt.campaign_approved' } })).toBe(1);
  });

  it('kanban: dependência impede concluir; mover e remarcar ficam auditados', async () => {
    const a = await saveTask(mkt.principal, null, { title: `Arte ${tag}`, areaKey: 'DESIGN', campaignId }, META);
    const b = await saveTask(mkt.principal, null, { title: `Post ${tag}`, areaKey: 'CONTEUDO', campaignId }, META);
    await setDependencies(mkt.principal, b, [a], META);
    await expect(setDependencies(mkt.principal, a, [b], META)).rejects.toThrow(/circular/);
    const done = (await prisma.mktBoardColumn.findFirstOrThrow({ where: { stage: 'EXECUTADO' }, orderBy: { position: 'asc' } })).id;
    await expect(moveTask(mkt.principal, b, done, null, null, META)).rejects.toThrow(/Conclua antes: Arte/);
    await moveTask(mkt.principal, a, done, null, null, META);
    await moveTask(mkt.principal, b, done, null, null, META);
    expect((await prisma.mktTask.findUniqueOrThrow({ where: { id: b } })).doneAt).not.toBeNull();
    await reschedule(mkt.principal, 'campanha', campaignId, addDays(start, 2), META);
    expect((await getCampaign(mkt.principal, campaignId, today)).data.startDate).toBe(addDays(start, 2));
    expect(await prisma.auditLog.count({ where: { entityId: b, action: 'mkt.task_moved' } })).toBe(1);
  });

  it('reunião semanal: pauta → ata (IA) → decisões viram tarefas só com aceite', async () => {
    const id = await createMeeting(mkt.principal, today, META);
    const m = await getMeeting(mkt.principal, id);
    expect(m.agenda.map((s) => s.key)).toContain('pendencias');
    const sid = await generateMinutes(mkt.principal, id, META);
    const s = (await getMeeting(mkt.principal, id)).suggestions.find((x) => x.id === sid)!;
    const before = await prisma.mktTask.count({ where: { origin: 'REUNIAO' } });
    const n = await decideMinutes(mkt.principal, sid, { minutes: `${s.payload.ata}\n(editada)`, accept: s.payload.decisoes.length ? [0] : [] }, META);
    expect(await prisma.mktTask.count({ where: { origin: 'REUNIAO' } })).toBe(before + n);
    expect((await getMeeting(mkt.principal, id)).minutes).toContain('(editada)');
  });

  it('command center e recomendações (aceitar cria tarefa; ignorar não)', async () => {
    const cc = await commandCenter(mkt.principal, addDays(start, -5));
    expect(cc.readiness.some((r) => r.id === campaignId)).toBe(true);
    const sid = await refreshRecommendations(mkt.principal, addDays(start, -6), META);
    const reco = (await commandCenter(mkt.principal, today)).recommendations!;
    expect(reco.id).toBe(sid);
    if (reco.items.length) {
      const idx = reco.items.findIndex((r) => r.tarefa);
      if (idx >= 0) expect(await decideRecommendation(mkt.principal, sid, idx, true, today, META)).toBeTruthy();
      await expect(decideRecommendation(mkt.principal, sid, Math.max(idx, 0), true, today, META)).rejects.toThrow(/já foi decidida/);
    }
    expect((await listCampaigns(mkt.principal, today)).some((c) => c.id === campaignId)).toBe(true);
  });

  it('permissões: professor e coordenador não veem marketing', async () => {
    for (const role of ['PROFESSOR', 'COORDENADOR']) {
      const u = await makeUser(role);
      await expect(commandCenter(u.principal, today)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(saveTask(u.principal, null, { title: 'x' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});
