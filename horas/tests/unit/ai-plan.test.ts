import { describe, expect, it } from 'vitest';
import { checkPlan, dayToSession, planToBlocks, sessionText, toSessionBlock, type AiPlan } from '@/domain/programming/ai-plan';
import { parseHistory } from '@/domain/programming/history';
import { fakePlan, fakeTechnicalPlan, systemPrompt, describeRequest, requestSchema } from '@/server/ai/workout-generator';
import { WEEK_METRICS, type WeekMetric } from '@/domain/programming/volume';
import { PERSONAL_KINDS, toPersonalBlocks } from '@/domain/personal';

const zero = Object.fromEntries(WEEK_METRICS.map((m) => [m.id, 0])) as Record<WeekMetric, number>;

describe('plano da IA', () => {
  it('vira blocos do Cadastro de Treino', () => {
    const blocks = planToBlocks(fakePlan());
    expect(blocks.map((b) => b.kind)).toEqual(['MOBILIDADE', 'AQUECIMENTO', 'FORCA', 'ESPECIFICO', 'WOD']);
    expect(blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0)).toBe(55);
    expect(blocks[4]).toMatchObject({ format: 'For time 21-15-9', timeCapMin: 10, content: 'pull-up\nDU x2' });
    expect(blocks[4]!.coachNotes).toContain('Quebre cedo os pull-ups.');
    expect(blocks[4]!.coachNotes).toContain('Escalas — RX: Como prescrito. | Intermediário: Jumping pull-up.');
    expect(blocks[2]!.coachNotes).toBe('Cotovelos altos.');
    expect(blocks[0]!.title).toBeNull();
  });

  it('vira treino Personal (aulão): tipos do Personal, cap no formato e orientações nas notas', () => {
    const blocks = toPersonalBlocks(planToBlocks(fakePlan()));
    expect(blocks.every((b) => (PERSONAL_KINDS as readonly string[]).includes(b.kind))).toBe(true);
    const wod = blocks.find((b) => b.kind === 'WOD')!;
    expect(wod.format).toBe("For time 21-15-9 · cap 10'");
    expect(wod.content).toBe('pull-up\nDU x2');
    expect(wod.notes).toContain('Professor: Quebre cedo os pull-ups.');
    expect(wod.notes.length).toBeLessThanOrEqual(600);
    const tech = toPersonalBlocks(planToBlocks(fakeTechnicalPlan(), 'futevolei'));
    expect(tech.map((b) => b.kind)).not.toContain('FUNDAMENTO');
    expect(tech.some((b) => b.kind === 'OUTRO' && b.title.startsWith('Jogo'))).toBe(true);
  });

  it('bloco de WOD vira bloco do motor com cap como duração', () => {
    const b = toSessionBlock({ kind: 'WOD', title: "O'Connor", durationMin: 18, format: '3 rounds for time', timeCapMin: 15, content: '15 thruster 29/43kg\n15 pull-up\n400m run', notes: null });
    expect(b).toMatchObject({ kind: 'WOD', minutes: 15, items: ['15 thruster 29/43kg', '15 pull-up', '400m run'] });
  });

  it('conferência: aula de 55, volume do WOD e força pesada sem recuperação', () => {
    const recent = parseHistory("## 2026-10-05\nFOR 10 | Front squat | 5x3 @85%\nWOD 12 | AMRAP 12' | 10 burpee\n## 2026-10-06\nWOD 12 | AMRAP 12' | 10 burpee");
    const plan: AiPlan = { ...fakePlan(), blocos: fakePlan().blocos.map((b) => (b.tipo === 'FORCA' ? { ...b, formato: "a cada 2' 5 sets 3-3-2-2-2 @80-88%" } : b)) };
    const c = checkPlan({ plan, date: '2026-10-07', targetMin: 55, recent, weekSoFar: zero, baseline: null });
    expect(c.totalMin).toBe(55);
    expect(c.alerts.find((a) => a.title === "Aula de 55'")?.level).toBe('ok');
    expect(c.wod).toMatchObject({ minutes: 10, domain: 'curto' });
    expect(c.wod!.patterns.find((p) => p.id === 'PULL_V')!.value).toBe(45);
    expect(c.alerts.some((a) => a.title === 'Força pesada sem recuperação')).toBe(true);
  });

  it('conferência: tempo de aula errado e semana acima do P90', () => {
    const plan: AiPlan = { ...fakePlan(), blocos: fakePlan().blocos.filter((b) => b.tipo !== 'MOBILIDADE') };
    const stat = { mean: 60, p50: 60, p75: 80, p90: 90 };
    const baseline = Object.fromEntries(WEEK_METRICS.map((m) => [m.id, stat])) as Record<WeekMetric, typeof stat>;
    const c = checkPlan({ plan, date: '2026-10-08', targetMin: 55, recent: [], weekSoFar: { ...zero, pull: 80 }, baseline });
    expect(c.alerts.find((a) => a.title === 'Tempo da aula')?.text).toContain('50 min');
    expect(c.alerts.some((a) => a.title === 'Pull acima do P90')).toBe(true);
  });

  it('prompt: DNA estável no sistema, pedido e semana na mensagem', async () => {
    const sys = await systemPrompt('crossfit');
    expect(sys).toContain('Aula de 55 minutos');
    expect(sys).toContain('# Lacunas');
    expect(sys).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // sem timestamps que quebram o cache
    const req = requestSchema.parse({ date: '2026-10-07', focus: 'HSPU', strength: 'sim' });
    const msg = await describeRequest(req, [], zero, 'crossfit');
    expect(msg).toContain('Quarta, 07/10/2026');
    expect(msg).toContain('Foco pedido pelo coach: HSPU');
  });

  it('prompt do Funcional: aula de 50\', vocabulário e regras próprias; Hyrox também; técnicas ainda sem IA', async () => {
    const sys = await systemPrompt('funcional');
    expect(sys).toContain('Aula de 50 minutos');
    expect(sys).toContain('É FUNCIONAL, não CrossFit');
    expect(sys).not.toContain('Fran, Cindy');
    expect(await systemPrompt('crossfit')).not.toContain('É FUNCIONAL');
    const hy = await systemPrompt('hyrox');
    expect(hy).toContain('Aula de 50 minutos');
    expect(hy).toContain('É HYROX');
    expect(hy).toContain('# Lacunas');
    await expect(systemPrompt('base-forte')).rejects.toThrow();
  });

  it('Futevôlei: prompt da metodologia (fundamento → jogo), níveis próprios e blocos técnicos', async () => {
    const sys = await systemPrompt('futevolei');
    expect(sys).toContain('somam exatamente 55.');
    expect(sys).toContain('Metodologia Nação Futevôlei');
    expect(sys).toContain('FUNDAMENTO');
    expect(sys).not.toContain('Fran, Cindy');
    const req = requestSchema.parse({ date: '2026-10-07', focus: 'recepção' });
    const msg = await describeRequest(req, [], zero, 'futevolei');
    expect(msg).toContain('Tema/fundamento pedido pelo coach: recepção');
    expect(msg).not.toContain('Força');
    const blocks = planToBlocks(fakeTechnicalPlan(), 'futevolei');
    expect(blocks.map((b) => b.kind)).toEqual(['MOBILIDADE', 'AQUECIMENTO', 'FUNDAMENTO', 'JOGO']);
    expect(blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0)).toBe(55);
    expect(blocks[2]!.coachNotes).toContain('Aprendiz (D/C):');
    expect(sessionText(dayToSession({ date: '2026-10-07', title: null, blocks }))).toContain('TEC 20 | Jogo: "Primeira bola vale dobro"');
  });
});
