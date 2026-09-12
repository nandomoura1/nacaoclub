import type { Battery, WodNumber } from '@/types/domain';

/**
 * Prescrição dos WODs — exatamente como fornecida pela organização.
 *
 * REGRA (§48): nada além do que foi informado. Padrão técnico de movimento,
 * altura do Box Jump Over, penalidades e critérios de validação NÃO estão
 * definidos e por isso NÃO aparecem inventados aqui — aparecem como pendência
 * declarada (`pendencias`), visível na própria página do WOD.
 */

export interface WodStep {
  ordem: string;
  movimento: string;
  detalhe?: string;
  masculino?: string;
  feminino?: string;
}

export interface WodSpec {
  numero: WodNumber;
  nome: string;
  formato: string;
  cap: string;
  resumo: string;
  blocos?: { janela: string; movimento: string; detalhe?: string }[];
  sequencia?: WodStep[];
  provas: { codigo: string; descricao: string; criterio: string }[];
  /** Regras de execução informadas pela organização. */
  regras?: string[];
  pontuacao: string;
  pendencias: string[];
}

export const WODS: Record<WodNumber, WodSpec> = {
  1: {
    numero: 1,
    nome: 'STRENGTH',
    formato: 'CARGA MÁXIMA',
    cap: '16 minutos',
    resumo:
      'Três blocos de tempo. A dupla usa uma única barra e é responsável por montar e trocar as cargas durante a prova. Cada atleta busca a maior carga válida em cada movimento.',
    blocos: [
      {
        janela: '0–5 min',
        movimento: '1RM Strict Press',
        detalhe: 'Cada atleta tem até 5 minutos para encontrar sua maior carga válida de 1 repetição.',
      },
      {
        janela: '5–10 min',
        movimento: '3RM Back Squat',
        detalhe: 'Maior carga válida para 3 repetições consecutivas, sem interrupção.',
      },
      {
        janela: '10–16 min',
        movimento: '5RM Deadlift',
        detalhe: 'Maior carga válida para 5 repetições consecutivas.',
      },
    ],
    provas: [
      { codigo: '1A', descricao: '1RM Strict Press', criterio: 'Soma dos dois atletas · maior vence' },
      { codigo: '1B', descricao: '3RM Back Squat', criterio: 'Soma dos dois atletas · maior vence' },
      { codigo: '1C', descricao: '5RM Deadlift', criterio: 'Soma dos dois atletas · maior vence' },
      {
        codigo: '1D',
        descricao: 'Resultado total de cargas',
        criterio: 'Soma das cargas válidas dos dois atletas nos três movimentos · maior vence',
      },
    ],
    regras: [
      'A dupla utiliza UMA única barra durante todo o workout.',
      'A montagem e a troca das cargas são responsabilidade da dupla.',
      'No Back Squat, as três repetições devem ser realizadas sem interrupção.',
      'No Deadlift, as cinco repetições devem ser consecutivas.',
    ],
    pontuacao:
      'O WOD 1 gera QUATRO pontuações. PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D. Em cada prova, 1º lugar = 1 ponto, 2º = 2 pontos, e assim por diante.',
    pendencias: [
      'Padrão técnico de cada levantamento não foi definido nesta especificação.',
      'Critério de validação de tentativa (juiz) não foi definido.',
    ],
  },

  2: {
    numero: 2,
    nome: 'ENDURANCE',
    formato: "AMRAP 22'",
    cap: '22 minutos',
    resumo:
      'Realizado simultaneamente em Shuttle Run e Assault Bike. O atleta 1 inicia na corrida, o atleta 2 na bike, e a dupla define sua própria estratégia de divisão do trabalho durante os 22 minutos.',
    blocos: [
      {
        janela: 'Atleta 1 inicia',
        movimento: 'Shuttle Run',
        detalhe: 'Cada ciclo corresponde a 500 metros — 10 × 50 metros.',
      },
      {
        janela: 'Atleta 2 inicia',
        movimento: 'Assault Bike',
        detalhe: 'Acumular a maior distância possível, em quilômetros, enquanto estiver na máquina.',
      },
    ],
    provas: [
      { codigo: '2A', descricao: 'Maior KM de corrida', criterio: 'Maior distância vence' },
      { codigo: '2B', descricao: 'Maior KM de Assault Bike', criterio: 'Maior distância vence' },
      {
        codigo: '2C',
        descricao: 'Soma dos KM (corrida + bike)',
        criterio: 'Maior soma vence',
      },
    ],
    regras: [
      'O atleta pode permanecer correndo por múltiplos de 500 metros.',
      'A troca entre os atletas só pode ocorrer após a conclusão de 500 m ou de seus múltiplos: 500, 1.000, 1.500, 2.000 m…',
      'Não é permitido trocar em 300 m, 700 m, 1.200 m ou qualquer distância que não seja múltiplo de 500.',
      'Caso o atleta ultrapasse um múltiplo de 500 m, deve continuar até atingir o próximo múltiplo para realizar a troca.',
      'A distância final registrada é a que a dupla percorreu quando o cronômetro parou — pode não ser múltiplo de 500 m.',
    ],
    pontuacao:
      'O WOD 2 gera TRÊS pontuações. PONTUAÇÃO DO WOD 2 = Pts 2A + Pts 2B + Pts 2C. Cada uma das três provas tem ranking próprio.',
    pendencias: [
      'Penalidade para troca fora do múltiplo de 500 m não foi definida — o sistema apenas recusa o lançamento inválido.',
    ],
  },

  3: {
    numero: 3,
    nome: 'METCON',
    formato: 'FOR TIME',
    cap: '20 minutos',
    resumo: 'A dupla deve completar o percurso no menor tempo possível.',
    sequencia: [
      { ordem: '1', movimento: '120 m Burpee Broad Jumps' },
      { ordem: '2', movimento: '120 Box Jump Over' },
      {
        ordem: '3',
        movimento: '60 m Sandbag Walking Lunge',
        masculino: '20 kg',
        feminino: '10 kg',
      },
      {
        ordem: '4',
        movimento: '240 m 2DB Farm Carry',
        masculino: '50 lb cada dumbbell',
        feminino: '35 lb cada dumbbell',
      },
      { ordem: '5', movimento: '120 Wall Ball', masculino: '20 lb', feminino: '14 lb' },
      { ordem: '6', movimento: '120 m Burpee Broad Jumps' },
    ],
    provas: [
      {
        codigo: '3A',
        descricao: 'Tempo total',
        criterio: 'Menor tempo válido = melhor posição',
      },
    ],
    pontuacao:
      '1º lugar = 1 ponto, 2º = 2 pontos, e assim por diante. Quem não concluir dentro do CAP registra 20:00 e o volume concluído.',
    pendencias: [
      'ALTURA DO BOX JUMP OVER não foi definida.',
      'Critério de ordenação das duplas que não concluíram é configurável em /admin/settings e começa como "decisão manual" — nenhuma regra foi assumida.',
      'Padrão técnico dos movimentos e critérios de no-rep não foram definidos.',
    ],
  },
};

/* ==========================================================================
   TIMELINE OFICIAL (§37)
   ========================================================================== */

export interface ScheduleEntry {
  hora: string;
  titulo: string;
  detalhe?: string;
  /** Sub-itens, como o conteúdo do briefing. */
  itens?: string[];
  /** Observação da organização, como o intervalo entre baterias. */
  nota?: string;
  wod?: WodNumber;
  /** Qual bateria disputa neste horário. */
  bateria?: Battery;
  destaque?: boolean;
}

export const SCHEDULE: ScheduleEntry[] = [
  {
    hora: '08h00',
    titulo: 'Aquecimento + Briefing',
    detalhe: 'Presença obrigatória de todos os participantes',
    itens: [
      'Aquecimento geral',
      'Mobilidade e preparação',
      'Apresentação dos workouts',
      'Explicação das regras',
      'Orientações sobre execução dos movimentos',
      'Estratégias e divisão das tarefas',
      'Esclarecimento de dúvidas',
    ],
  },

  { hora: '09h00–09h16', titulo: 'Workout 01 — Bateria 1', detalhe: 'Strength', wod: 1, bateria: 1 },
  {
    hora: '09h26–09h42',
    titulo: 'Workout 01 — Bateria 2',
    detalhe: 'Strength',
    wod: 1,
    bateria: 2,
    nota: "Intervalo de 14' entre as baterias",
  },

  { hora: '09h30–09h52', titulo: 'Workout 02 — Bateria 1', detalhe: 'Endurance', wod: 2, bateria: 1 },
  {
    hora: '09h56–10h16',
    titulo: 'Workout 02 — Bateria 2',
    detalhe: 'Endurance',
    wod: 2,
    bateria: 2,
    nota: "Intervalo de 20' entre as baterias",
  },

  { hora: '10h12–10h32', titulo: 'Workout 03 — Bateria 1', detalhe: 'Metcon', wod: 3, bateria: 1 },
  { hora: '10h36–10h56', titulo: 'Workout 03 — Bateria 2', detalhe: 'Metcon', wod: 3, bateria: 2 },

  { hora: '11h00', titulo: 'Conferência / classificação' },
  { hora: '11h30', titulo: 'Pódio', destaque: true },
];

/**
 * Os três horários de uma bateria, na ordem dos WODs.
 *
 * É o que o atleta abre o celular para descobrir na manhã do evento:
 * "eu sou bateria 1 — então entro 09h00, 09h30 e 10h12".
 */
export function horariosDaBateria(
  bateria: Battery,
): { wod: WodNumber; hora: string }[] {
  return SCHEDULE.filter(
    (e): e is ScheduleEntry & { wod: WodNumber } => e.bateria === bateria && e.wod !== undefined,
  )
    .map((e) => ({ wod: e.wod, hora: e.hora }))
    .sort((a, b) => a.wod - b.wod);
}
