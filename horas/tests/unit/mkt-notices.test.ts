import { describe, expect, it } from 'vitest';
import { campaignNotice, noticeText, onBoard } from '@/domain/marketing/notices';

describe('Comunicação Interna — regras puras', () => {
  it('texto do WhatsApp com variáveis e confirmação', () => {
    const t = noticeText({ kind: 'URGENTE', title: ' Piscina fechada ', body: 'Oi, {primeiro_nome}! Amanhã sem aulas na piscina.', askConfirmation: true }, { primeiro_nome: 'Ana' });
    expect(t).toBe('⚠️ *Piscina fechada*\n\nOi, Ana! Amanhã sem aulas na piscina.\n\nResponda *OK* para confirmar que leu. 💙');
    expect(noticeText({ kind: 'AVISO', title: 'X', body: 'Oi {primeiro_nome}', askConfirmation: false }, {})).toBe('📣 *X*\n\nOi');
  });
  it('mural: fixado até a data limite; os outros por 7 dias', () => {
    expect(onBoard({ publishedAt: null, pinned: true, showUntil: null }, '2026-10-14')).toBe(false);
    expect(onBoard({ publishedAt: '2026-10-01T12:00:00Z', pinned: true, showUntil: null }, '2026-10-14')).toBe(true);
    expect(onBoard({ publishedAt: '2026-10-01T12:00:00Z', pinned: true, showUntil: '2026-10-10' }, '2026-10-14')).toBe(false);
    expect(onBoard({ publishedAt: '2026-10-08T12:00:00Z', pinned: false, showUntil: null }, '2026-10-14')).toBe(true);
    expect(onBoard({ publishedAt: '2026-10-01T12:00:00Z', pinned: false, showUntil: null }, '2026-10-14')).toBe(false);
  });
  it('comunicado de campanha', () => {
    const n = campaignNotice({ name: 'Verão Nação', objective: 'Matrículas de verão', audience: null, offer: '20% no plano anual', message: null, cta: 'Agendar aula experimental no WhatsApp', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(n.title).toBe('Campanha: Verão Nação');
    expect(n.body).toContain('de 01/11 a 30/11');
    expect(n.body).toContain('🎁 Oferta: 20% no plano anual');
    expect(n.body).not.toContain('Para quem');
  });
});
