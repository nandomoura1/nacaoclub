import { describe, expect, it } from 'vitest';
import { checkColumns, columnFor, sortColumns, type BoardColumn } from '@/domain/marketing/board';

const col = (id: string, stage: BoardColumn['stage'], position: number): BoardColumn => ({ id, name: id, color: null, stage, position });

describe('Kanban de Marketing — colunas editáveis', () => {
  const cols = [col('feito', 'EXECUTADO', 3), col('ideias', 'BACKLOG', 0), col('fazendo', 'PRODUCAO', 1), col('fazendo2', 'PRODUCAO', 2)];
  it('tarefa aparece na sua coluna; sem coluna, na primeira da etapa ou na mais próxima', () => {
    expect(sortColumns(cols).map((c) => c.id)).toEqual(['ideias', 'fazendo', 'fazendo2', 'feito']);
    expect(columnFor({ columnId: 'fazendo2', column: 'PRODUCAO' }, cols)?.id).toBe('fazendo2');
    expect(columnFor({ columnId: null, column: 'PRODUCAO' }, cols)?.id).toBe('fazendo');
    expect(columnFor({ columnId: 'apagada', column: 'APROVACAO' }, cols)?.id).toBe('fazendo'); // vizinha mais próxima
    expect(columnFor({ columnId: null, column: 'RESULTADOS' }, cols)?.id).toBe('feito');
    expect(columnFor({ columnId: null, column: 'BACKLOG' }, [])).toBeNull();
  });
  it('quadro precisa de coluna e de uma "Concluído"', () => {
    expect(checkColumns([])).toMatch(/pelo menos uma coluna/);
    expect(checkColumns([{ stage: 'BACKLOG' }])).toMatch(/Concluído/);
    expect(checkColumns([{ stage: 'BACKLOG' }, { stage: 'RESULTADOS' }])).toBeNull();
  });
});
