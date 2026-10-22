import { describe, expect, it } from 'vitest';
import { briefingText, hasCommercial, type BriefingInput } from '@/domain/marketing/briefing';

const base: BriefingInput = {
  id: 'x', name: 'Aulão de Verão', type: 'EVENTO', details: '🔥 HYROX — 7h e 8h · 24 vagas\nCheck-in pelo Tecnofit', startDate: '2026-11-02', endDate: '2026-11-21',
  objective: 'Lotar o aulão', audience: 'Alunos e amigos', product: null, offer: '1ª aula grátis', message: 'Verão é na Nação', cta: 'Chama no WhatsApp',
  channels: ['ig_feed', 'whatsapp'], conversionChannel: 'whatsapp', conversionUrl: null, goal: '150 inscritos',
  owner: 'Ana Souza', leadOwner: 'Bruno Lima',
  event: { name: 'Aulão de Verão', startDate: '2026-11-21', endDate: null, location: 'Arena', registrationUrl: 'https://nacao.club/aulao' },
  tasks: [
    { title: 'Arte do feed', assignee: 'Carla', dueDate: '2026-10-25', column: 'PRODUCAO' },
    { title: 'Reels de chamada', assignee: 'Carla', dueDate: '2026-10-18', column: 'SEMANA' },
    { title: 'Roteiro', assignee: 'Ana Souza', dueDate: '2026-10-10', column: 'EXECUTADO' },
    { title: 'Banner da recepção', assignee: null, dueDate: null, column: 'BACKLOG' },
  ],
};

describe('Briefing da campanha', () => {
  it('monta resumo, bloco do Comercial e quem faz o quê', () => {
    const t = briefingText(base, { tasks: 'pendentes', commercial: true, link: 'https://app/c/x' }, '2026-10-20');
    expect(t).toContain('📋 *BRIEFING — Aulão de Verão*');
    expect(t).toContain('📅 *Campanha:* 02/11 (seg) a 21/11 (sáb)');
    expect(t).toContain('📍 *Local:* Arena');
    expect(t).toContain('📋 *COMO FUNCIONA*\n🔥 HYROX — 7h e 8h · 24 vagas\nCheck-in pelo Tecnofit');
    expect(t).toContain('📣 *Onde vai aparecer:* Instagram Feed, WhatsApp');
    expect(t).toContain('💼 *PARA O COMERCIAL*');
    expect(t).toContain('• *Onde fecha:* WhatsApp comercial');
    expect(t).toContain('• *Quem atende os leads:* Bruno Lima');
    // Pendentes: a do roteiro (feita) sai e vira contagem; atrasada é marcada; sem responsável vem por último.
    expect(t).not.toContain('Roteiro');
    expect(t).toContain('✔️ 1 tarefa já feita.');
    expect(t).toContain('⚠️ Reels de chamada — até 18/10 (dom) · *atrasada*');
    expect(t.indexOf('👤 *Carla*')).toBeLessThan(t.indexOf('👤 *Sem responsável definido*'));
    expect(t).toContain('🔗 Detalhes no sistema: https://app/c/x');
  });

  it('comunicado à equipe leva o "como funciona"', async () => {
    const { campaignNotice } = await import('@/domain/marketing/notices');
    const n = campaignNotice({ ...base, details: 'Vagas: 24 por horário' });
    expect(n.body).toContain('📋 *Como funciona*\nVagas: 24 por horário');
    expect(campaignNotice({ ...base, details: null }).body).not.toContain('Como funciona');
  });

  it('opções: todas as tarefas, sem tarefas, sem Comercial', () => {
    expect(briefingText(base, { tasks: 'todas', commercial: true, link: null }, '2026-10-20')).toContain('✔️ Roteiro — até 10/10 (sáb) · feito');
    const t = briefingText(base, { tasks: 'nenhuma', commercial: false, link: null }, '2026-10-20');
    expect(t).not.toContain('QUEM FAZ O QUÊ');
    expect(t).not.toContain('PARA O COMERCIAL');
    expect(t).not.toContain('🔗');
    const vazio = { ...base, offer: null, cta: null, conversionChannel: null, leadOwner: null };
    expect(hasCommercial(vazio)).toBe(false);
    expect(briefingText(vazio, { tasks: 'nenhuma', commercial: true, link: null }, '2026-10-20')).not.toContain('PARA O COMERCIAL');
  });
});
