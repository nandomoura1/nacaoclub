import { describe, expect, it } from 'vitest';
import { escolherEventoAtual } from '@/lib/evento/atual';

/**
 * QUAL EVENTO O PÚBLICO VÊ.
 *
 * Esta regra já falhou em produção: a organização criou a etapa seguinte e
 * arquivou a anterior, e o leaderboard ficou VAZIO — porque o rascunho da
 * etapa futura, de data mais recente, roubou o lugar. Os testes abaixo são
 * aquele dia, congelado.
 */

const ev = (status: 'DRAFT' | 'LIVE' | 'FINISHED', date: string, id: string) => ({
  id,
  status,
  date,
  createdAt: `${date}T10:00:00Z`,
});

describe('O evento que o site mostra', () => {
  it('sem nenhum evento, não inventa nada', () => {
    expect(escolherEventoAtual([])).toBeNull();
  });

  it('o que está no ar ganha, mesmo com data mais antiga', () => {
    const escolhido = escolherEventoAtual([
      ev('DRAFT', '2027-11-07', 'rascunho'),
      ev('LIVE', '2026-09-12', 'no-ar'),
      ev('FINISHED', '2026-12-20', 'arquivado'),
    ]);
    expect(escolhido?.id).toBe('no-ar');
  });

  // O bug de produção, em uma linha.
  it('sem nada no ar, o ARQUIVADO vence o rascunho de data mais nova', () => {
    const escolhido = escolherEventoAtual([
      ev('DRAFT', '2027-11-07', 'etapa-sendo-montada'),
      ev('FINISHED', '2026-09-12', 'etapa-que-acabou'),
    ]);
    expect(escolhido?.id).toBe('etapa-que-acabou');
  });

  it('entre dois arquivados, o mais recente', () => {
    const escolhido = escolherEventoAtual([
      ev('FINISHED', '2026-06-20', 'antigo'),
      ev('FINISHED', '2026-12-20', 'recente'),
    ]);
    expect(escolhido?.id).toBe('recente');
  });

  // Instalação nova: só existe rascunho. Melhor mostrar algo do que dar erro.
  it('só com rascunhos, devolve o mais recente em vez de nada', () => {
    const escolhido = escolherEventoAtual([
      ev('DRAFT', '2027-01-10', 'velho'),
      ev('DRAFT', '2027-05-10', 'novo'),
    ]);
    expect(escolhido?.id).toBe('novo');
  });

  it('empate de data desempata pela criação', () => {
    const escolhido = escolherEventoAtual([
      { id: 'primeiro', status: 'FINISHED', date: '2026-09-12', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'segundo', status: 'FINISHED', date: '2026-09-12', createdAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(escolhido?.id).toBe('segundo');
  });

  it('não altera a lista que recebeu', () => {
    const lista = [ev('DRAFT', '2027-11-07', 'a'), ev('LIVE', '2026-09-12', 'b')];
    escolherEventoAtual(lista);
    expect(lista.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
