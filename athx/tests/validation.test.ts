import { describe, expect, it } from 'vitest';
import {
  agendaSchema,
  colaboradorSchema,
  edicaoDeEventoSchema,
  eventoSchema,
  lancamentoSchema,
  provaSchema,
  settingsSchema,
  teamSchema,
} from '@/lib/validation';

const UUID = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

/** Uma prova válida, para variar só o campo que o teste está provando. */
function prova(over: Record<string, unknown> = {}) {
  return {
    wodId: UUID,
    codigo: '1A',
    descricao: '1RM Strict Press',
    criterio: null,
    unidade: 'KG',
    direcao: 'MAIOR_VENCE',
    origem: 'DIGITADA',
    porAtleta: true,
    componentes: [],
    pontua: true,
    ordem: 1,
    ...over,
  };
}

describe('Cadastro de prova', () => {
  it('aceita uma prova lançada por atleta', () => {
    expect(provaSchema.safeParse(prova()).success).toBe(true);
  });

  it('aceita todas as unidades e as duas direções', () => {
    for (const unidade of ['KG', 'KM', 'METROS', 'SEGUNDOS', 'REPS', 'CALORIAS']) {
      for (const direcao of ['MAIOR_VENCE', 'MENOR_VENCE']) {
        expect(
          provaSchema.safeParse(prova({ unidade, direcao })).success,
          `${unidade} · ${direcao}`,
        ).toBe(true);
      }
    }
  });

  it('recusa unidade que não existe', () => {
    expect(provaSchema.safeParse(prova({ unidade: 'LEGUAS' })).success).toBe(false);
  });

  it('código aceita só letra e número', () => {
    expect(provaSchema.safeParse(prova({ codigo: '2C' })).success).toBe(true);
    expect(provaSchema.safeParse(prova({ codigo: '1 A' })).success).toBe(false);
    expect(provaSchema.safeParse(prova({ codigo: '1-A' })).success).toBe(false);
  });

  // Uma prova calculada sem componentes somaria o nada.
  it('prova calculada exige o que somar', () => {
    expect(
      provaSchema.safeParse(prova({ origem: 'SOMA', porAtleta: false, componentes: [] })).success,
    ).toBe(false);
    expect(
      provaSchema.safeParse(
        prova({ origem: 'SOMA', porAtleta: false, componentes: ['1A', '1B'] }),
      ).success,
    ).toBe(true);
  });

  it('prova calculada não é lançada por atleta', () => {
    expect(
      provaSchema.safeParse(prova({ origem: 'SOMA', porAtleta: true, componentes: ['1A'] }))
        .success,
    ).toBe(false);
  });

  it('prova lançada pelo juiz não soma outras', () => {
    expect(provaSchema.safeParse(prova({ origem: 'DIGITADA', componentes: ['1A'] })).success).toBe(
      false,
    );
  });
});

describe('Cadastro de dupla', () => {
  it('aceita uma dupla completa', () => {
    const r = teamSchema.parse({
      teamNumber: '7',
      teamName: '  Buriti  ',
      category: 'MASCULINA',
      athlete1: 'Zé',
      athlete2: 'Dan',
      battery: '2',
      status: 'ATIVA',
    });
    expect(r.teamNumber).toBe(7);
    expect(r.teamName).toBe('Buriti');
    expect(r.battery).toBe(2);
  });

  // Quantas baterias existem é do evento; o schema só recusa absurdo.
  it('aceita bateria além da segunda', () => {
    const base = {
      teamNumber: 1,
      teamName: 'X',
      category: 'MISTA',
      athlete1: '',
      athlete2: '',
      status: 'ATIVA',
    };
    expect(teamSchema.safeParse({ ...base, battery: 5 }).success).toBe(true);
    expect(teamSchema.safeParse({ ...base, battery: 0 }).success).toBe(false);
  });

  it('exige nome da dupla', () => {
    expect(
      teamSchema.safeParse({
        teamNumber: 1,
        teamName: '   ',
        category: 'MISTA',
        battery: 1,
        status: 'ATIVA',
      }).success,
    ).toBe(false);
  });
});

describe('Lançamento', () => {
  it('aceita o valor como texto — a conversão é do servidor', () => {
    const r = lancamentoSchema.parse({
      teamId: UUID,
      concluiu: true,
      volume: null,
      valores: {
        [OUTRO]: { valor: '2,41', atleta1: null, atleta2: null },
      },
    });
    expect(r.valores[OUTRO]?.valor).toBe('2,41');
  });

  it('aceita os dois campos de uma prova por atleta', () => {
    const r = lancamentoSchema.parse({
      teamId: UUID,
      concluiu: true,
      volume: null,
      valores: { [OUTRO]: { valor: null, atleta1: '62,5', atleta2: '60' } },
    });
    expect(r.valores[OUTRO]?.atleta1).toBe('62,5');
  });

  it('converte o volume com vírgula', () => {
    const r = lancamentoSchema.parse({
      teamId: UUID,
      concluiu: false,
      volume: '420,5',
      valores: {},
    });
    expect(r.volume).toBe(420.5);
  });
});

describe('Configurações', () => {
  const base = {
    tiePointsMode: 'COMPETITION',
    dnfPolicy: 'PENDING_DEFINITION',
    tieBreaker1: 'WOD3',
    tieBreaker2: 'NENHUM',
    tieBreaker3: 'NENHUM',
    baterias: 2,
    liveMode: true,
    maintenanceMode: false,
  };

  it('aceita um critério apontando para qualquer WOD', () => {
    for (const criterio of ['NENHUM', 'WOD1', 'WOD5', 'WOD12']) {
      expect(settingsSchema.safeParse({ ...base, tieBreaker1: criterio }).success, criterio).toBe(
        true,
      );
    }
  });

  it('recusa texto livre como critério', () => {
    expect(
      settingsSchema.safeParse({ ...base, tieBreaker1: 'melhor colocação no WOD 3' }).success,
    ).toBe(false);
  });

  it('exige ao menos uma bateria', () => {
    expect(settingsSchema.safeParse({ ...base, baterias: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, baterias: 1 }).success).toBe(true);
  });
});

describe('Programação', () => {
  it('aceita um momento ligado a um WOD e a uma bateria', () => {
    const r = agendaSchema.parse({
      ordem: 2,
      hora: '09h00–09h16',
      titulo: 'Workout 01 — Bateria 1',
      detalhe: 'Strength',
      itens: [],
      nota: null,
      wodId: UUID,
      bateria: 1,
      destaque: false,
    });
    expect(r.bateria).toBe(1);
  });

  it('aceita um momento solto, como o briefing', () => {
    expect(
      agendaSchema.safeParse({
        ordem: 1,
        hora: '08h00',
        titulo: 'Briefing',
        detalhe: null,
        itens: ['Aquecimento geral', 'Explicação das regras'],
        nota: null,
        wodId: null,
        bateria: null,
        destaque: false,
      }).success,
    ).toBe(true);
  });
});

describe('Cadastro de evento', () => {
  const base = {
    nome: 'Nação Híbrida — Etapa Março',
    slug: 'nacao-hibrida-marco',
    data: '2027-03-14',
    copiarDe: UUID,
  };

  it('aceita um evento clonando outro', () => {
    expect(eventoSchema.safeParse(base).success).toBe(true);
  });

  it('aceita um evento começando em branco', () => {
    expect(eventoSchema.safeParse({ ...base, copiarDe: null }).success).toBe(true);
  });

  // O endereço vira parte de uma URL. O que não sobrevive a um link é
  // recusado aqui, antes de a pessoa enviar o formulário.
  it('recusa endereço que não sobrevive a um link', () => {
    for (const slug of ['Etapa Março', 'etapa_marco', 'etapa/marco', '-marco', 'marco-', 'a']) {
      expect(eventoSchema.safeParse({ ...base, slug }).success, slug).toBe(false);
    }
  });

  // Maiúscula não é erro, é descuido: o endereço é normalizado em vez de
  // devolver uma reclamação. A função athx_clonar_evento faz o mesmo
  // lower() no banco, então os dois lados concordam.
  it('normaliza maiúsculas em vez de recusar', () => {
    const r = eventoSchema.parse({ ...base, slug: 'ETAPA-Marco' });
    expect(r.slug).toBe('etapa-marco');
  });

  it('aceita endereço com número e hífen', () => {
    for (const slug of ['etapa-2027', 'marco', 'nacao-hibrida-3a-etapa']) {
      expect(eventoSchema.safeParse({ ...base, slug }).success, slug).toBe(true);
    }
  });

  it('exige nome de verdade', () => {
    expect(eventoSchema.safeParse({ ...base, nome: 'ab' }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...base, nome: '   ' }).success).toBe(false);
  });

  it('exige data no formato do banco', () => {
    expect(eventoSchema.safeParse({ ...base, data: '14/03/2027' }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...base, data: '2027-03-14' }).success).toBe(true);
  });
});

describe('Autorização de colaborador', () => {
  it('guarda o e-mail em minúsculas, para bater com o do login', () => {
    const r = colaboradorSchema.parse({ email: '  Juiz@NacaoClub.com.BR ', nome: ' Juiz ' });
    expect(r.email).toBe('juiz@nacaoclub.com.br');
    expect(r.nome).toBe('Juiz');
  });

  it('recusa o que não é e-mail', () => {
    for (const email of ['juiz', 'juiz@', '@nacaoclub.com.br', 'juiz nacaoclub.com.br']) {
      expect(colaboradorSchema.safeParse({ email, nome: null }).success, email).toBe(false);
    }
  });

  it('nome é opcional', () => {
    expect(colaboradorSchema.safeParse({ email: 'a@b.com.br', nome: null }).success).toBe(true);
  });
});

describe('Edição do evento', () => {
  const base = {
    id: UUID,
    nome: 'Nação Hibrida — 4ª Celebration 2026',
    slug: 'nacao-hibrida-celebration4-2026',
    data: '2026-11-07',
  };

  it('aceita renomear mantendo o endereço', () => {
    expect(edicaoDeEventoSchema.safeParse(base).success).toBe(true);
  });

  it('exige o id de quem está sendo editado', () => {
    const { id: _, ...semId } = base;
    expect(edicaoDeEventoSchema.safeParse(semId).success).toBe(false);
  });

  it('aplica ao endereço a mesma regra da criação', () => {
    expect(edicaoDeEventoSchema.safeParse({ ...base, slug: 'Etapa Março' }).success).toBe(false);
    expect(edicaoDeEventoSchema.parse({ ...base, slug: 'ETAPA-Marco' }).slug).toBe('etapa-marco');
  });

  // Criar oferece "copiar as regras de"; editar, não. Um evento que já tem
  // WODs não pode ganhar os de outro por cima no meio da edição.
  it('não aceita copiarDe, que é só da criação', () => {
    const r = edicaoDeEventoSchema.parse({ ...base, copiarDe: UUID });
    expect('copiarDe' in r).toBe(false);
  });
});
