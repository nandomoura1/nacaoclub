import { describe, expect, it } from 'vitest';
import { conferirEvento, criterioPorExtenso } from '@/lib/evento/conferencia';
import type { Prova, Wod } from '@/types/wod';
import { WODS } from './helpers';

/**
 * A CONFERÊNCIA DA CONFIGURAÇÃO.
 *
 * Cada caso aqui é um problema que existiu de verdade na 4ª Celebration e
 * que o sistema não denunciava — só apareceu numa simulação.
 */

function prova(over: Partial<Prova> & { codigo: string }): Prova {
  return {
    id: `p-${over.codigo}-${Math.random()}`,
    wodId: 'w',
    descricao: over.codigo,
    criterio: null,
    unidade: 'KG',
    direcao: 'MAIOR_VENCE',
    origem: 'DIGITADA',
    porAtleta: false,
    componentes: [],
    pontua: true,
    ordem: 1,
    ...over,
  };
}

function wod(numero: number, nome: string, provas: Prova[]): Wod {
  return {
    id: `w${numero}`,
    eventId: 'e',
    numero,
    nome,
    formato: null,
    capSegundos: null,
    resumo: null,
    permiteCap: false,
    regras: [],
    pendencias: [],
    ordem: numero,
    blocos: [],
    provas,
  };
}

const SEM_DESEMPATE = { tieBreaker1: 'NENHUM', tieBreaker2: 'NENHUM', tieBreaker3: 'NENHUM' } as const;

const titulos = (a: ReturnType<typeof conferirEvento>) => a.map((x) => x.titulo).join(' | ');

describe('Um evento bem montado não gera ruído', () => {
  it('não acha nada no evento de setembro', () => {
    const achados = conferirEvento(WODS, { ...SEM_DESEMPATE, tieBreaker1: 'WOD3' }, 20);
    expect(achados, titulos(achados)).toHaveLength(0);
  });
});

describe('O desempate', () => {
  const wods = [
    wod(1, 'STRENGTH', [prova({ codigo: '1A' })]),
    wod(2, 'ENDURANCE', [prova({ codigo: '2A' })]),
  ];

  it('aponta para um WOD que não existe', () => {
    const achados = conferirEvento(wods, { ...SEM_DESEMPATE, tieBreaker1: 'WOD4' }, 10);
    expect(achados.some((a) => a.gravidade === 'ERRO' && /WOD4/.test(a.titulo))).toBe(true);
  });

  it('não reclama quando aponta para um WOD que existe', () => {
    const achados = conferirEvento(wods, { ...SEM_DESEMPATE, tieBreaker1: 'WOD2' }, 10);
    expect(achados).toHaveLength(0);
  });

  // O que esconde o erro é a tela escrever só o número. Com o nome junto,
  // quem escolheu o METCON vê "ENDURANCE" e percebe na hora.
  it('por extenso, traz o nome do workout', () => {
    expect(criterioPorExtenso('WOD2', wods)).toBe('WOD 2 — ENDURANCE');
    expect(criterioPorExtenso('NENHUM', wods)).toBeNull();
    expect(criterioPorExtenso('WOD9', wods)).toContain('não existe');
  });
});

describe('Códigos e ordens repetidos', () => {
  // Foi exatamente isto na 4ª Celebration: 2A, 2B e 2C nos WODs 2 e 3.
  it('acusa o mesmo código em dois WODs', () => {
    const wods = [
      wod(2, 'STRENGTH', [prova({ codigo: '2A' }), prova({ codigo: '2B', ordem: 2 })]),
      wod(3, 'ENDURANCE', [prova({ codigo: '2A' }), prova({ codigo: '2B', ordem: 2 })]),
    ];
    const achados = conferirEvento(wods, SEM_DESEMPATE, 10);
    expect(achados.filter((a) => /se repete/.test(a.titulo))).toHaveLength(2);
  });

  it('acusa duas provas com a mesma ordem no mesmo WOD', () => {
    const wods = [
      wod(1, 'STRENGTH', [
        prova({ codigo: '1A', ordem: 3 }),
        prova({ codigo: '1B', ordem: 3 }),
      ]),
    ];
    const achados = conferirEvento(wods, SEM_DESEMPATE, 10);
    expect(achados.some((a) => /mesma ordem \(3\)/.test(a.titulo))).toBe(true);
  });
});

describe('Workouts e provas vazios', () => {
  it('acusa WOD sem nenhuma prova', () => {
    const achados = conferirEvento([wod(1, 'VAZIO', [])], SEM_DESEMPATE, 10);
    expect(achados.some((a) => a.gravidade === 'ERRO' && /não tem nenhuma prova/.test(a.titulo))).toBe(true);
  });

  it('avisa quando nenhuma prova do WOD pontua', () => {
    const wods = [wod(1, 'EXIBIÇÃO', [prova({ codigo: '1A', pontua: false })])];
    const achados = conferirEvento(wods, SEM_DESEMPATE, 10);
    expect(achados.some((a) => /Nenhuma prova do WOD 1/.test(a.titulo))).toBe(true);
  });

  it('acusa prova calculada somando o que não existe', () => {
    const wods = [
      wod(1, 'STRENGTH', [
        prova({ codigo: '1A' }),
        prova({ codigo: '1D', origem: 'SOMA', componentes: ['1A', '1B'], ordem: 2 }),
      ]),
    ];
    const achados = conferirEvento(wods, SEM_DESEMPATE, 10);
    expect(achados.some((a) => a.gravidade === 'ERRO' && /1B/.test(a.titulo))).toBe(true);
  });

  it('avisa que não há duplas inscritas', () => {
    const achados = conferirEvento([wod(1, 'A', [prova({ codigo: '1A' })])], SEM_DESEMPATE, 0);
    expect(achados.some((a) => /Nenhuma dupla/.test(a.titulo))).toBe(true);
  });

  it('todo achado diz o que fazer e para onde ir', () => {
    const wods = [wod(1, 'VAZIO', [])];
    for (const a of conferirEvento(wods, { ...SEM_DESEMPATE, tieBreaker1: 'WOD9' }, 0)) {
      expect(a.comoResolver.length, a.titulo).toBeGreaterThan(20);
      expect(a.onde, a.titulo).toBeTruthy();
    }
  });
});
