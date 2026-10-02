import { describe, expect, it } from 'vitest';
import { GUIDELINES_TEMPLATE, guidelinesTemplate, teacherGradeText, whatsappLink } from '@/domain/teacher-share';

describe('grade do professor no WhatsApp', () => {
  const slots = [
    { weekday: 3, startMin: 360, durationMin: 60, modality: 'Funcional', label: 'Funcional 1', space: null, role: 'TITULAR', counts: true },
    { weekday: 1, startMin: 300, durationMin: 60, modality: 'HYROX', label: null, space: 'Box', role: 'AUXILIAR', counts: true },
    { weekday: 1, startMin: 720, durationMin: 30, modality: 'Personal', label: null, space: null, role: 'TITULAR', counts: false },
  ];

  it('aulas por dia em ordem, total sem personal, escalas e orientações', () => {
    const text = teacherGradeText({
      name: 'Rafael Souza', date: '2026-10-05', slots,
      duties: [{ date: '2026-10-10', startMin: 420, endMin: 720, sector: 'Academia' }],
      areas: [{ name: 'Aulas Coletivas', guidelines: 'Conduta\n- Chegar 10 min antes.' }, { name: 'Nação Fit', guidelines: ' ' }], specific: 'Abrir o box às 5h.',
    });
    expect(text).toContain('*Sua grade na Nação — Rafael Souza*');
    expect(text.indexOf('*Segunda*')).toBeLessThan(text.indexOf('*Quarta*'));
    expect(text).toContain('• 05:00–06:00 HYROX (Box · auxiliar)');
    expect(text).toContain('• 06:00–07:00 Funcional (Funcional 1)');
    expect(text).toContain('Total: 3 aula(s) · 2h por semana');
    expect(text).toContain('• sáb 10/10 07:00–12:00 Academia');
    expect(text).toContain('*Atribuições e orientações — Aulas Coletivas*\n*Conduta*\n- Chegar 10 min antes.');
    expect(text).not.toContain('Nação Fit'); // área sem texto não aparece
    expect(text).toContain('*Para você, Rafael*\nAbrir o box às 5h.');
  });

  it('sem orientações não cria a seção; modelo inicial tem conduta, tarefas e rotina', () => {
    const text = teacherGradeText({ name: 'Ju', date: '2026-10-05', slots: [], duties: [], areas: [], specific: '' });
    expect(text).toContain('Sem aulas fixas na grade.');
    expect(text).not.toContain('Atribuições');
    for (const t of ['Conduta', 'Tarefas', 'Rotina']) expect(GUIDELINES_TEMPLATE).toContain(t);
    expect(guidelinesTemplate({ modalities: ['Musculação'] })).toContain('fichas de treino');
    expect(guidelinesTemplate({ modalities: ['Funcional', 'GAP'] })).toBe(GUIDELINES_TEMPLATE);
  });

  it('link do WhatsApp vai direto para o número (DDD) ou abre a escolha de contato', () => {
    expect(whatsappLink('(61) 99999-1234', 'oi')).toBe('https://wa.me/5561999991234?text=oi');
    expect(whatsappLink('+55 61 99999-1234', 'a b')).toBe('https://wa.me/5561999991234?text=a%20b');
    expect(whatsappLink(null, 'oi')).toBe('https://wa.me/?text=oi');
  });
});
