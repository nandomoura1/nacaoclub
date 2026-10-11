import { describe, expect, it } from 'vitest';
import { commercialGate, milestoneAlerts, readiness, type CampaignFacts, type TaskFacts } from '@/domain/marketing/readiness';
import { baseTemplate, dueFromOffset, openDependencies, positionBetween } from '@/domain/marketing/tasks';
import { monthEnd, monthGrid, moveRange, shiftMonth } from '@/domain/marketing/calendar';
import { attention, weeklyAgenda } from '@/domain/marketing/agenda';

const T = '2026-10-11';
const C = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
  type: 'EVENTO', status: 'PLANEJAMENTO', objective: 'Encher o evento', audience: 'Alunos e famílias', offer: null, message: 'Celebre com a Nação',
  cta: 'Inscreva-se', channels: ['ig_feed', 'tecnofit'], conversionChannel: null, conversionUrl: null, leadOwnerId: null, measurement: null,
  ownerId: 'u1', startDate: '2026-11-10', endDate: '2026-11-10', ...over,
});
const tk = (area: TaskFacts['area'], title: string, column = 'BACKLOG', dueDate: string | null = null): TaskFacts => ({ area, title, column, dueDate });

describe('Marketing — readiness e trava comercial', () => {
  it('evento completo chega a 100; itens comerciais não se aplicam', () => {
    const r = readiness(C(), [tk('DESIGN', 'Feed'), tk('CONTEUDO', 'Reels')], T);
    expect(r.score).toBe(100);
    expect(r.items.some((i) => i.key === 'conversao')).toBe(false);
  });

  it('campanha comercial sem conversão/lead/medição perde pontos e lista o que falta', () => {
    const r = readiness(C({ type: 'RENOVACAO', offer: '10% off' }), [tk('DESIGN', 'Feed'), tk('CONTEUDO', 'Reels')], T);
    expect(r.score).toBeLessThan(80);
    expect(r.missing.map((m) => m.key).sort()).toEqual(['conversao', 'lead', 'medicao']);
  });

  it('tarefa atrasada derruba "prazos em dia"', () => {
    const r = readiness(C(), [tk('DESIGN', 'Feed', 'PRODUCAO', '2026-10-01'), tk('CONTEUDO', 'Reels')], T);
    expect(r.missing.map((m) => m.key)).toEqual(['prazo']);
  });

  it('trava comercial: só campanhas comerciais; aponta o que falta', () => {
    expect(commercialGate(C())).toEqual([]);
    expect(commercialGate(C({ type: 'VENDAS', cta: '' }))).toEqual(['CTA', 'canal de conversão (com link)', 'responsável pelo lead', 'forma de medir o resultado']);
    expect(commercialGate(C({ type: 'VENDAS', conversionChannel: 'landing', conversionUrl: 'https://nacao.club/x', leadOwnerId: 'u2', measurement: 'UTM' }))).toEqual([]);
  });
});

describe('Marketing — antecedência D-30…D+7', () => {
  it('nada antes do D-30; próximo marco informado', () => {
    const m = milestoneAlerts(C({ startDate: '2026-12-31' }), [], T);
    expect(m).toMatchObject({ current: null, alerts: [], next: { label: 'D-30', date: '2026-12-01' } });
  });

  it('em D-21 cobra canais e tarefas de design/conteúdo, com sugestão de tarefa', () => {
    const m = milestoneAlerts(C({ startDate: '2026-11-01', channels: [] }), [], T);
    expect(m.current).toBe('D-21');
    expect(m.alerts.map((a) => a.key)).toEqual(['canais', 'design_tarefas', 'conteudo_tarefas']);
    expect(m.alerts[0]!.suggestion).toMatchObject({ area: 'PLANEJAMENTO' });
  });

  it('em D-7 exige programada e comunicação interna; comercial exige lead', () => {
    const m = milestoneAlerts(C({ type: 'VENDAS', startDate: '2026-10-17', offer: 'x', conversionChannel: 'landing', conversionUrl: 'https://x' }), [tk('DESIGN', 'a', 'EXECUTADO'), tk('CONTEUDO', 'b', 'EXECUTADO')], T);
    expect(m.alerts.filter((a) => a.milestone === 'D-7').map((a) => a.key)).toEqual(['programada', 'interna', 'lead']);
  });

  it('campanha finalizada só confere D+7', () => {
    const m = milestoneAlerts(C({ startDate: '2026-09-20', status: 'FINALIZADA', channels: [] }), [], T);
    expect(m.alerts).toEqual([]);
  });
});

describe('Marketing — tarefas, kanban e calendário', () => {
  it('modelo-base: evento traz cobertura e pós; comercial traz landing e WhatsApp', () => {
    const ev = baseTemplate('EVENTO', true);
    expect(ev.some((t) => /cobertura/i.test(t.title) && t.offset === 0)).toBe(true);
    expect(baseTemplate('VENDAS', false).filter((t) => t.area === 'COMERCIAL')).toHaveLength(2);
    expect(baseTemplate('INSTITUCIONAL', false).some((t) => t.area === 'COMERCIAL')).toBe(false);
  });

  it('prazo da sugestão nunca fica no passado', () => {
    expect(dueFromOffset('2026-11-10', -30, T)).toBe('2026-10-11');
    expect(dueFromOffset('2026-11-10', -7, T)).toBe('2026-11-03');
  });

  it('posição fracionária e dependências abertas', () => {
    expect(positionBetween(null, null)).toBe(1000);
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(null, 1000)).toBe(0);
    expect(openDependencies([{ title: 'Arte', column: 'PRODUCAO' }, { title: 'Roteiro', column: 'EXECUTADO' }])).toEqual(['Arte']);
  });

  it('grade do mês começa na segunda e cobre o mês; mover mantém duração', () => {
    const g = monthGrid('2026-10');
    expect(g[0]![0]).toBe('2026-09-28');
    expect(g.at(-1)!.at(-1)! >= '2026-10-31').toBe(true);
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(moveRange('2026-10-10', '2026-10-12', '2026-10-20')).toEqual({ start: '2026-10-20', end: '2026-10-22' });
  });
});

describe('Marketing — atenção e pauta', () => {
  const camp = { ...C({ startDate: '2026-10-15', channels: [] }), id: 'c1', name: 'Nação Celebration' };
  const tasks = [{ ...tk('DESIGN', 'Feed', 'PRODUCAO', '2026-10-05'), id: 't1', campaignId: 'c1', assignee: 'Paulo' }];

  it('atenção junta marcos, readiness baixo e atrasos, críticos primeiro', () => {
    const a = attention([camp], tasks, T);
    expect(a[0]!.level).toBe('critico');
    expect(a.some((x) => x.text.startsWith('Tarefa atrasada: Feed'))).toBe(true);
    expect(a.some((x) => x.text.includes('readiness'))).toBe(true);
  });

  it('pauta tem as seções da reunião', () => {
    const s = weeklyAgenda({ today: T, campaigns: [camp], tasks, events: [{ id: 'e1', name: 'Celebration', startDate: '2026-10-15', endDate: null, status: 'CONFIRMADO' }], items: [], areaNames: {} });
    expect(s.map((x) => x.key)).toEqual(['semana', 'proxima', '30dias', 'campanhas', 'comercial', 'comunicacao', 'conteudo', 'design', 'canais', 'conversao', 'pendencias']);
    expect(s.find((x) => x.key === 'proxima')!.items.some((i) => i.includes('Celebration'))).toBe(true);
    expect(s.find((x) => x.key === 'design')!.items[0]).toContain('ATRASADA');
  });
});
