import { describe, expect, it } from 'vitest';
import { funnel, parseLeadPayload, slugify, sourceFromUtm, withUtm } from '@/domain/marketing/leads';

describe('leads e links (puro)', () => {
  it('lê formulário do Wix (lista de campos), objeto simples e aninhado', () => {
    const wix = parseLeadPayload({ data: { submissionId: 'sub-1', formName: 'Aula experimental', submissions: [
      { label: 'Primeiro nome', value: 'Ana' }, { label: 'Sobrenome', value: 'Souza' }, { label: 'E-mail', value: 'Ana@Email.com' },
      { label: 'Telefone', value: '(61) 99999-8888' }, { label: 'Modalidade de interesse', value: 'Beach Tennis' }, { label: 'Mensagem', value: 'Quero agendar' },
    ] } });
    expect(wix).toMatchObject({ name: 'Ana Souza', email: 'ana@email.com', phone: '(61) 99999-8888', interest: 'Beach Tennis', message: 'Quero agendar', ref: 'sub-1' });
    expect(parseLeadPayload({ nome: 'Bruno', whatsapp: '61988887777', utm_source: 'instagram' })).toMatchObject({ name: 'Bruno', phone: '61988887777', utm: { source: 'instagram' } });
    expect(parseLeadPayload({ contact: { name: 'Caio', phone: '123' } })).toMatchObject({ name: 'Caio', phone: null });
  });
  it('origem pela UTM', () => {
    expect(sourceFromUtm({ source: 'meta', medium: 'cpc' })).toBe('META_ADS');
    expect(sourceFromUtm({ source: 'instagram', medium: 'social' })).toBe('INSTAGRAM');
    expect(sourceFromUtm({ source: 'google', medium: 'cpc' })).toBe('GOOGLE');
    expect(sourceFromUtm({})).toBe('SITE');
  });
  it('link com UTM e slug', () => {
    expect(slugify('Aula Experimental — Beach Tennis!')).toBe('aula-experimental-beach-tennis');
    expect(withUtm('https://nacaoclub.com/aula?x=1', { source: 'instagram', medium: 'social', campaign: 'verao' })).toBe('https://nacaoclub.com/aula?x=1&utm_source=instagram&utm_medium=social&utm_campaign=verao');
    expect(withUtm('https://x.com/?utm_source=ja', { source: 'outro' })).toBe('https://x.com/?utm_source=ja');
  });
  it('funil: conversão, taxa de fechamento, tempo e origem', () => {
    const f = funnel([
      { stage: 'MATRICULADO', source: 'SITE', createdAt: '2026-10-01T00:00:00Z', convertedAt: '2026-10-05T00:00:00Z' },
      { stage: 'PERDIDO', source: 'SITE', createdAt: '2026-10-01T00:00:00Z', convertedAt: null },
      { stage: 'NOVO', source: 'INSTAGRAM', createdAt: '2026-10-02T00:00:00Z', convertedAt: null },
      { stage: 'MATRICULADO', source: 'INSTAGRAM', createdAt: '2026-10-02T00:00:00Z', convertedAt: '2026-10-04T00:00:00Z' },
    ]);
    expect([f.total, f.won, f.conversion, f.winRate, f.avgDaysToWin]).toEqual([4, 2, 0.5, 2 / 3, 3]);
    expect(f.bySource.map((s) => [s.id, s.total, s.won])).toEqual([['SITE', 2, 1], ['INSTAGRAM', 2, 1]]);
  });
});
