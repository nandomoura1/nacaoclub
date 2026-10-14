import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { approveCopy, discardStudio, listStudio, studioAnalise, studioCopy, studioPauta, studioToTask } from '@/server/services/mkt-studio-service';
import { saveCampaign } from '@/server/services/marketing-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

/** IA Marketing em modo exemplo (AI_FAKE): nada vira tarefa ou texto aprovado sem decisão humana. */
describe.skipIf(!hasDb)('Marketing — IA Marketing', () => {
  const prev = process.env.AI_FAKE;
  const y = 2600 + Math.floor(Math.random() * 300);
  let mkt: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    process.env.AI_FAKE = '1';
    await ensureCatalog();
    for (const [i, key] of ['PLANEJAMENTO', 'COMUNICACAO', 'CONTEUDO', 'DESIGN', 'COMERCIAL'].entries()) await prisma.mktArea.upsert({ where: { key }, create: { key, name: key, color: '#0169E9', sortOrder: i }, update: {} });
    mkt = await makeUser('MARKETING'); lider = await makeUser('LIDER');
  });
  afterAll(() => { process.env.AI_FAKE = prev; });

  it('textos: gera variações e aprova uma (com edição)', async () => {
    const campaignId = await saveCampaign(mkt.principal, null, { name: `Verão ${y}`, type: 'AQUISICAO', objective: 'Matrículas', cta: 'Agende sua aula', channels: ['ig_reels'], startDate: `${y}-01-10` }, META);
    await expect(studioCopy(lider.principal, { formato: 'REELS', pilar: 'COMUNIDADE', campaignId, tema: null, instrucoes: null }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(studioCopy(mkt.principal, { formato: 'REELS', pilar: 'COMUNIDADE', campaignId: null, tema: null, instrucoes: null }, META)).rejects.toThrow(/campanha ou escreva o tema/);
    const id = await studioCopy(mkt.principal, { formato: 'REELS', pilar: 'COMUNIDADE', campaignId, tema: null, instrucoes: 'mais curto' }, META);
    const it = (await listStudio(mkt.principal)).find((x) => x.id === id)!;
    expect(it.kind).toBe('COPY');
    expect(it.status).toBe('PENDENTE');
    if (it.kind !== 'COPY') throw new Error();
    expect(it.payload.variacoes.length).toBeGreaterThanOrEqual(2);
    expect(it.payload.pedido.campanha).toBe(`Verão ${y}`);
    await approveCopy(mkt.principal, id, 1, 'Texto final revisado pela equipe', META);
    const s = await prisma.mktAiSuggestion.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe('ACEITA');
    expect((s.payload as { aprovada: { texto: string } }).aprovada.texto).toBe('Texto final revisado pela equipe');
  });

  it('pauta e análise: viram tarefa só quando alguém escolhe', async () => {
    const pid = await studioPauta(mkt.principal, { de: `${y}-03-02`, ate: `${y}-03-08`, foco: null }, META);
    const before = await prisma.mktTask.count();
    const taskId = await studioToTask(mkt.principal, pid, 0, `${y}-03-01`, META);
    expect(await prisma.mktTask.count()).toBe(before + 1);
    const t = await prisma.mktTask.findUniqueOrThrow({ where: { id: taskId }, include: { area: true } });
    expect(t.origin).toBe('IA');
    expect(t.area?.key).toBe('CONTEUDO');
    expect(t.title).toMatch(/^\[REELS\]/);
    await expect(studioToTask(mkt.principal, pid, 0, `${y}-03-01`, META)).rejects.toThrow(/já virou tarefa/);
    expect((await prisma.mktAiSuggestion.findUniqueOrThrow({ where: { id: pid } })).status).toBe('PARCIAL');

    const aid = await studioAnalise(mkt.principal, { de: `${y}-03-01`, ate: `${y}-03-31` }, META);
    await studioToTask(mkt.principal, aid, 0, `${y}-03-01`, META);
    const d = await studioPauta(mkt.principal, { de: `${y}-04-01`, ate: `${y}-04-07`, foco: null }, META);
    await discardStudio(mkt.principal, d, META);
    expect((await prisma.mktAiSuggestion.findUniqueOrThrow({ where: { id: d } })).status).toBe('RECUSADA');
    await expect(studioPauta(mkt.principal, { de: `${y}-04-01`, ate: `${y}-06-07`, foco: null }, META)).rejects.toThrow(/31 dias/);
  });
});
