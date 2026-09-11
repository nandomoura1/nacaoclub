import type { WodNumber } from '@/types/domain';

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
  blocos?: { janela: string; movimento: string }[];
  sequencia?: WodStep[];
  provas: { codigo: string; descricao: string; criterio: string }[];
  pontuacao: string;
  pendencias: string[];
}

export const WODS: Record<WodNumber, WodSpec> = {
  1: {
    numero: 1,
    nome: 'STRENGTH',
    formato: 'CARGA MÁXIMA',
    cap: '15 minutos',
    resumo:
      'Três levantamentos em janelas fixas de 5 minutos. Vale o total somado das cargas dos dois atletas.',
    blocos: [
      { janela: '0–5 min', movimento: '1RM Strict Press' },
      { janela: '5–10 min', movimento: '3RM Back Squat' },
      { janela: '10–15 min', movimento: '5RM Deadlift' },
    ],
    provas: [
      { codigo: '1A', descricao: '1RM Strict Press', criterio: 'Soma dos dois atletas' },
      { codigo: '1B', descricao: '3RM Back Squat', criterio: 'Soma dos dois atletas' },
      { codigo: '1C', descricao: '5RM Deadlift', criterio: 'Soma dos dois atletas' },
      {
        codigo: '1D',
        descricao: 'Resultado total de cargas',
        criterio: 'Maior total = melhor posição',
      },
    ],
    pontuacao:
      'A pontuação do WOD 1 vem da prova 1D (total de cargas). 1º lugar = 1 ponto, 2º = 2 pontos, e assim por diante.',
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
      'Atleta 1 começa no shuttle run; atleta 2 começa na assault bike. A dupla define a estratégia de revezamento.',
    blocos: [
      { janela: 'Atleta 1 inicia', movimento: 'Shuttle Run — 500 m (10 × 50 m)' },
      { janela: 'Atleta 2 inicia', movimento: 'Assault Bike — máximo de quilômetros' },
    ],
    provas: [
      { codigo: '2A', descricao: 'KM de corrida', criterio: 'Maior distância = melhor posição' },
      { codigo: '2B', descricao: 'KM de assault bike', criterio: 'Maior distância = melhor posição' },
      {
        codigo: '2C',
        descricao: 'Soma dos KM (corrida + bike)',
        criterio: 'Maior soma = melhor posição',
      },
    ],
    pontuacao:
      'PONTUAÇÃO DO WOD 2 = Pts 2A + Pts 2B + Pts 2C. Cada uma das três provas tem ranking próprio.',
    pendencias: [
      'Penalidade para troca fora do múltiplo de 500 m não foi definida — o sistema apenas recusa o lançamento inválido.',
    ],
  },

  3: {
    numero: 3,
    nome: 'METCON',
    formato: 'FOR TIME',
    cap: '20 minutos',
    resumo: 'Sequência completa para tempo. Menor tempo válido = melhor posição.',
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

/** Programação do evento (§37). */
export const SCHEDULE: { hora: string; titulo: string; detalhe?: string; destaque?: boolean }[] = [
  { hora: '08h00', titulo: 'Aquecimento + Briefing' },
  { hora: '09h00–09h15', titulo: 'WOD 1 — Bateria 1', detalhe: 'Strength' },
  { hora: '09h20–09h35', titulo: 'WOD 1 — Bateria 2', detalhe: 'Strength' },
  { hora: '09h35–09h40', titulo: 'Transição Judges' },
  { hora: '09h40–10h02', titulo: 'WOD 2 — Bateria 1', detalhe: 'Endurance' },
  { hora: '10h02–10h24', titulo: 'WOD 2 — Bateria 2', detalhe: 'Endurance' },
  { hora: '10h24–10h29', titulo: 'Transição Judges' },
  { hora: '10h29–10h49', titulo: 'WOD 3 — Bateria 1', detalhe: 'Metcon' },
  { hora: '10h51–11h11', titulo: 'WOD 3 — Bateria 2', detalhe: 'Metcon' },
  { hora: '11h11–11h30', titulo: 'Conferência / classificação' },
  { hora: '11h30', titulo: 'Pódio', destaque: true },
];
