import type { Prova, Wod, WodBloco } from '@/types/wod';

/**
 * A ETAPA SETEMBRO AMARELO, ESCRITA NO MODELO NOVO.
 *
 * Isto não é mais "o evento": é o evento DE SETEMBRO, descrito como dado.
 * Serve para três coisas:
 *
 *   · a migração do banco, que converte os resultados de setembro
 *   · o modo demonstração, que precisa de um evento completo sem banco
 *   · o botão "começar a partir da etapa de setembro" na tela de WODs,
 *     para montar a próxima etapa editando em vez de começar do zero
 *
 * Nada aqui está cravado no motor. Trocar este arquivo por outro — ou montar
 * tudo pela tela — produz um evento diferente sem tocar em uma linha de
 * código de pontuação.
 */

function bloco(
  ordem: number,
  janela: string,
  movimento: string,
  detalhe: string | null = null,
  masculino: string | null = null,
  feminino: string | null = null,
): WodBloco {
  return { ordem, janela, movimento, detalhe, masculino, feminino };
}

interface ProvaSpec {
  codigo: string;
  descricao: string;
  criterio: string;
  unidade: Prova['unidade'];
  direcao: Prova['direcao'];
  origem?: Prova['origem'];
  porAtleta?: boolean;
  componentes?: string[];
}

function provas(wodId: string, specs: readonly ProvaSpec[]): Prova[] {
  return specs.map((s, i) => ({
    id: `${wodId}-${s.codigo.toLowerCase()}`,
    wodId,
    codigo: s.codigo,
    descricao: s.descricao,
    criterio: s.criterio,
    unidade: s.unidade,
    direcao: s.direcao,
    origem: s.origem ?? 'DIGITADA',
    porAtleta: s.porAtleta ?? false,
    componentes: s.componentes ?? [],
    pontua: true,
    ordem: i + 1,
  }));
}

export const WODS_SETEMBRO: Wod[] = [
  {
    id: 'wod-1',
    eventId: 'evento-setembro',
    numero: 1,
    nome: 'STRENGTH',
    formato: 'CARGA MÁXIMA',
    capSegundos: 960,
    permiteCap: false,
    resumo:
      'Três blocos de tempo. A dupla usa uma única barra e é responsável por montar e trocar as cargas durante a prova. Cada atleta busca a maior carga válida em cada movimento.',
    blocos: [
      bloco(1, '0–5 min', '1RM Strict Press', 'Cada atleta tem até 5 minutos para encontrar sua maior carga válida de 1 repetição.'),
      bloco(2, '5–10 min', '3RM Back Squat', 'Maior carga válida para 3 repetições consecutivas, sem interrupção.'),
      bloco(3, '10–16 min', '5RM Deadlift', 'Maior carga válida para 5 repetições consecutivas.'),
    ],
    regras: [
      'A dupla utiliza UMA única barra durante todo o workout.',
      'A montagem e a troca das cargas são responsabilidade da dupla.',
      'No Back Squat, as três repetições devem ser realizadas sem interrupção.',
      'No Deadlift, as cinco repetições devem ser consecutivas.',
    ],
    pendencias: [
      'Padrão técnico de cada levantamento não foi definido nesta especificação.',
      'Critério de validação de tentativa (juiz) não foi definido.',
    ],
    ordem: 1,
    provas: provas('wod-1', [
      {
        codigo: '1A',
        descricao: '1RM Strict Press',
        criterio: 'Soma dos dois atletas · maior vence',
        unidade: 'KG',
        direcao: 'MAIOR_VENCE',
        porAtleta: true,
      },
      {
        codigo: '1B',
        descricao: '3RM Back Squat',
        criterio: 'Soma dos dois atletas · maior vence',
        unidade: 'KG',
        direcao: 'MAIOR_VENCE',
        porAtleta: true,
      },
      {
        codigo: '1C',
        descricao: '5RM Deadlift',
        criterio: 'Soma dos dois atletas · maior vence',
        unidade: 'KG',
        direcao: 'MAIOR_VENCE',
        porAtleta: true,
      },
      {
        codigo: '1D',
        descricao: 'Resultado total de cargas',
        criterio: 'Soma das cargas válidas dos dois atletas nos três movimentos · maior vence',
        unidade: 'KG',
        direcao: 'MAIOR_VENCE',
        origem: 'SOMA',
        componentes: ['1A', '1B', '1C'],
      },
    ]),
  },

  {
    id: 'wod-2',
    eventId: 'evento-setembro',
    numero: 2,
    nome: 'ENDURANCE',
    formato: "AMRAP 22'",
    capSegundos: 1320,
    permiteCap: false,
    resumo:
      'Realizado simultaneamente em Shuttle Run e Assault Bike. O atleta 1 inicia na corrida, o atleta 2 na bike, e a dupla define sua própria estratégia de divisão do trabalho durante os 22 minutos.',
    blocos: [
      bloco(1, 'Atleta 1 inicia', 'Shuttle Run', 'Cada ciclo corresponde a 500 metros — 10 × 50 metros.'),
      bloco(2, 'Atleta 2 inicia', 'Assault Bike', 'Acumular a maior distância possível, em quilômetros, enquanto estiver na máquina.'),
    ],
    regras: [
      'O atleta pode permanecer correndo por múltiplos de 500 metros.',
      'A troca entre os atletas só pode ocorrer após a conclusão de 500 m ou de seus múltiplos: 500, 1.000, 1.500, 2.000 m…',
      'Não é permitido trocar em 300 m, 700 m, 1.200 m ou qualquer distância que não seja múltiplo de 500.',
      'Caso o atleta ultrapasse um múltiplo de 500 m, deve continuar até atingir o próximo múltiplo para realizar a troca.',
      'A distância final registrada é a que a dupla percorreu quando o cronômetro parou — pode não ser múltiplo de 500 m.',
    ],
    pendencias: [
      'Penalidade para troca fora do múltiplo de 500 m não foi definida.',
    ],
    ordem: 2,
    provas: provas('wod-2', [
      {
        codigo: '2A',
        descricao: 'Maior KM de corrida',
        criterio: 'Maior distância vence',
        unidade: 'KM',
        direcao: 'MAIOR_VENCE',
      },
      {
        codigo: '2B',
        descricao: 'Maior KM de Assault Bike',
        criterio: 'Maior distância vence',
        unidade: 'KM',
        direcao: 'MAIOR_VENCE',
      },
      {
        codigo: '2C',
        descricao: 'Soma dos KM (corrida + bike)',
        criterio: 'Maior soma vence',
        unidade: 'KM',
        direcao: 'MAIOR_VENCE',
        origem: 'SOMA',
        componentes: ['2A', '2B'],
      },
    ]),
  },

  {
    id: 'wod-3',
    eventId: 'evento-setembro',
    numero: 3,
    nome: 'METCON',
    formato: 'FOR TIME',
    capSegundos: 1200,
    permiteCap: true,
    resumo: 'A dupla deve completar o percurso no menor tempo possível.',
    blocos: [
      bloco(1, '1', '120 m Burpee Broad Jumps'),
      bloco(2, '2', '120 Box Jump Over'),
      bloco(3, '3', '60 m Sandbag Walking Lunge', null, '20 kg', '10 kg'),
      bloco(4, '4', '240 m 2DB Farm Carry', null, '50 lb cada dumbbell', '35 lb cada dumbbell'),
      bloco(5, '5', '120 Wall Ball', null, '20 lb', '14 lb'),
      bloco(6, '6', '120 m Burpee Broad Jumps'),
    ],
    regras: [],
    pendencias: [
      'ALTURA DO BOX JUMP OVER não foi definida.',
      'Critério de ordenação das duplas que não concluíram é configurável em /admin/settings e começa como "decisão manual" — nenhuma regra foi assumida.',
      'Padrão técnico dos movimentos e critérios de no-rep não foram definidos.',
    ],
    ordem: 3,
    provas: provas('wod-3', [
      {
        codigo: '3A',
        descricao: 'Tempo total',
        criterio: 'Menor tempo válido = melhor posição',
        unidade: 'SEGUNDOS',
        direcao: 'MENOR_VENCE',
      },
    ]),
  },
];
