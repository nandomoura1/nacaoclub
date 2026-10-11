import { describe, expect, it } from 'vitest';
import { guessArea, guessColumn, parseTrelloBoard, planImport, slimBoard, suggestMapping, trelloDate, trelloRef } from '@/domain/marketing/trello';
import { trelloExport } from '../fixtures/trello-board';

describe('importação do Trello (puro)', () => {
  const raw = trelloExport();
  const b = parseTrelloBoard(raw);
  const id = (c: string) => raw.cards.find((x) => x.name === c)!.id;

  it('rejeita arquivo que não é quadro', () => {
    expect(() => parseTrelloBoard({ foo: 1 })).toThrow(/quadro do Trello/);
    expect(() => parseTrelloBoard([])).toThrow();
  });

  it('lê listas, etiquetas, membros, checklists (os dois formatos), anexos e comentários', () => {
    expect(b.name).toBe('Marketing Nação (exemplo)');
    expect(b.lists.map((l) => l.cards)).toEqual([2, 2, 1, 1, 0, 1]);
    const c1 = b.cards.find((c) => c.name === 'Arte do Celebration')!;
    expect(c1.checklists[0]!.items).toEqual([{ text: 'Stories', done: false }, { text: 'Feed', done: true }]); // ordem do Trello
    expect(c1.attachments).toEqual([{ name: 'Referência', url: 'https://drive.google.com/x' }]); // só http(s)
    expect(c1.comments).toEqual([{ author: 'Pessoa Um', date: '2026-10-10', text: 'Primeira versão no Drive' }]);
    expect(b.cards.find((c) => c.name === 'Ideia solta')!.checklists[0]!.items[0]!.text).toBe('Rascunho');
  });

  it('prazo em UTC vira a data de Brasília', () => {
    expect(trelloDate('2026-10-20T02:00:00.000Z')).toBe('2026-10-19');
    expect(trelloDate('2026-10-15T12:00:00.000Z')).toBe('2026-10-15');
    expect(trelloDate(null)).toBeNull();
  });

  it('sugere coluna pelo nome da lista e área por palavra-chave', () => {
    expect(['Ideias', 'A fazer', 'Fazendo', 'Aprovação', 'Concluído ✅', 'Agendados', 'Esta semana'].map(guessColumn))
      .toEqual(['BACKLOG', 'PROXIMAS', 'PRODUCAO', 'APROVACAO', 'EXECUTADO', 'PROGRAMADO', 'SEMANA']);
    expect(guessArea('Design')).toBe('DESIGN');
    expect(guessArea('Gravar reels')).toBe('CONTEUDO');
    expect(guessArea('Aviso no WhatsApp')).toBe('COMUNICACAO');
    expect(guessArea('Urgente')).toBeNull();
  });

  it('mapeamento sugerido: lista arquivada ignorada e nenhuma pessoa ligada automaticamente', () => {
    const m = suggestMapping(b);
    expect(Object.values(m.lists)).toEqual(['BACKLOG', 'PROXIMAS', 'PRODUCAO', 'APROVACAO', 'EXECUTADO', 'IGNORAR']);
    expect(Object.values(m.members).every((v) => v === '')).toBe(true);
  });

  it('plano: área pela etiqueta, depois pelo título; concluído vai para Executado; pula arquivados e duplicados', () => {
    const m = { ...suggestMapping(b), members: { [raw.members[0]!.id]: 'u-1', [raw.members[1]!.id]: 'u-2' } };
    const p = planImport(b, m, new Set([trelloRef(id('Ideia solta'))]));
    expect(p.skipped).toEqual({ ignoredList: 1, archived: 1, duplicates: 1 });
    const t = Object.fromEntries(p.tasks.map((x) => [x.title, x]));
    expect(p.tasks.map((x) => x.title)).toEqual(['Aviso no WhatsApp da mudança de horário', 'Gravar reels do treino de sábado', 'Arte do Celebration', 'Post de boas-vindas']);
    expect(t['Arte do Celebration']).toMatchObject({ column: 'PRODUCAO', areaKey: 'DESIGN', areaGuessed: false, assigneeId: 'u-1', collaboratorIds: ['u-2'], dueDate: '2026-10-19', tags: ['Design', 'Urgente'] });
    expect(t['Arte do Celebration']!.description).toContain('Importado do Trello: https://trello.com/c/c1');
    expect(t['Arte do Celebration']!.comments[0]).toBe('Trello · Pessoa Um (10/10/2026): Primeira versão no Drive');
    expect(t['Aviso no WhatsApp da mudança de horário']).toMatchObject({ areaKey: 'COMUNICACAO', areaGuessed: true, assigneeId: 'u-2' });
    expect(t['Post de boas-vindas']).toMatchObject({ column: 'EXECUTADO', areaKey: 'CONTEUDO', areaGuessed: true });
    expect(planImport(b, { ...m, guessAreaFromTitle: false, importComments: false }).tasks.find((x) => x.title === 'Post de boas-vindas')).toMatchObject({ areaKey: null, comments: [] });
  });

  it('incluir arquivados traz o card arquivado e o da lista arquivada só se a lista for mapeada', () => {
    const m = { ...suggestMapping(b), includeArchived: true };
    expect(planImport(b, m).skipped).toEqual({ ignoredList: 1, archived: 0, duplicates: 0 });
    expect(slimBoard(b, suggestMapping(b)).cards.map((c) => c.name)).not.toContain('Card arquivado');
  });
});
