import { describe, expect, it } from 'vitest';
import { matchByName, monthDays, parsePlanText, planText, postTask, shiftMonth, taskDue, weekdayOf } from '@/domain/marketing/cronograma';

const DOC = `# **Cronograma de Dezembro 2026 · Instagram Nação**

## **Objetivos de dezembro**

  - **Plano Duo (vendas):** upgrade com 10% OFF.

### **01/12, TERÇA**

**PLANO DUO**

Carrossel | “Duas modalidades. Um plano.”

Slide 1: Duas modalidades. Um plano.

Slide 2: CrossFit + academia.

CTA: Chama no WhatsApp, link na bio.

Stories: repost do carrossel + enquete “Qual seria o seu combo?”

### **05/12, SÁBADO**

STORIES

Sem post no feed.

### **11/12, SEXTA**

**CROSSFIT**

Post estático | “Murph de Natal.”

O último grande desafio do ano. 19/12, sábado. \\[horário\\]

CTA: Bora fechar o ano no Murph?

### **24/12, QUINTA (Véspera de Natal)**

**NATAL**

Reels | “Feliz Natal, Nação.”

Professores e equipe desejando Feliz Natal.

## **A confirmar antes de aprovar**

  - ☐ Horários do Murph de Natal.`;

describe('Cronograma do mês — puro', () => {
  it('lê o formato do Docs da equipe', () => {
    const r = parsePlanText(DOC, '2026-12');
    expect(r.posts.map((p) => [p.date, p.topic, p.format])).toEqual([
      ['2026-12-01', 'PLANO DUO', 'CARROSSEL'], ['2026-12-05', 'STORIES', 'STORIES'], ['2026-12-11', 'CROSSFIT', 'ESTATICO'], ['2026-12-24', 'NATAL', 'REELS'],
    ]);
    const duo = r.posts[0]!;
    expect(duo.title).toBe('Duas modalidades. Um plano.');
    expect(duo.body).toContain('Slide 2: CrossFit + academia.');
    expect(duo.cta).toBe('Chama no WhatsApp, link na bio.');
    expect(duo.stories).toMatch(/enquete/);
    expect(r.posts[1]!.body).toBe('Sem post no feed.');
    expect(r.posts[2]!.pending).toBe('horário');
    // A seção "A confirmar" não entra no último post.
    expect(r.posts[3]!.body).not.toMatch(/Horários do Murph/);
    expect(r.objectives).toMatch(/Plano Duo/);
    expect(r.objectives).not.toMatch(/Cronograma de Dezembro/);
  });

  it('ignora dias de outro mês e volta ao mesmo texto (ida e volta)', () => {
    expect(parsePlanText(DOC, '2027-01').posts).toHaveLength(0);
    const r = parsePlanText(DOC, '2026-12');
    const again = parsePlanText(planText('2026-12', r.objectives, r.posts), '2026-12');
    expect(again.posts.map((p) => [p.date, p.topic, p.format, p.title, p.cta])).toEqual(r.posts.map((p) => [p.date, p.topic, p.format, p.title, p.cta]));
  });

  it('datas, prazo da tarefa e ligação por nome', () => {
    expect(monthDays('2026-12')).toHaveLength(31);
    expect(monthDays('2027-02')).toHaveLength(28);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(weekdayOf('2026-12-01')).toBe('TERÇA');
    expect(taskDue('2026-12-11', '2026-11-24')).toBe('2026-12-09');
    expect(taskDue('2026-12-01', '2026-11-30')).toBe('2026-11-30');
    const events = [{ id: 'a', name: 'Murph de Natal' }, { id: 'b', name: 'WOD "Árvore de Natal"' }, { id: 'c', name: 'Natal' }];
    expect(matchByName({ topic: 'CROSSFIT', title: 'Murph de Natal.', body: null }, events)?.id).toBe('a');
    expect(matchByName({ topic: 'CROSSFIT', title: 'WOD Árvore de Natal.', body: null }, events)?.id).toBe('b');
    expect(matchByName({ topic: 'TÊNIS', title: 'Acerta o alvo', body: null }, events)).toBeNull();
    const t = postTask({ date: '2026-12-11', channel: 'INSTAGRAM', topic: 'CROSSFIT', format: 'ESTATICO', title: 'Murph de Natal.', body: 'Texto', cta: 'Bora', stories: null, pending: 'horário' });
    expect(t.title).toBe('[Post estático] Murph de Natal.');
    expect(t.description).toMatch(/Publicar em 11\/12 \(sexta\)/);
    expect(t.description).toMatch(/A confirmar: horário/);
  });
});
