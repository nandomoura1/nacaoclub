/**
 * NAÇÃO ATHX — modelo de domínio.
 * Estes tipos espelham exatamente as tabelas do Supabase (supabase/migrations).
 */

export const CATEGORIES = ['MASCULINA', 'FEMININA', 'MISTA'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Nome oficial da categoria, como a organização a chama.
 * Usado onde há espaço: detalhe da dupla, formulários, títulos e exportação.
 */
export const CATEGORY_LABEL: Record<Category, string> = {
  MASCULINA: 'Dupla Masculina',
  FEMININA: 'Dupla Feminina',
  MISTA: 'Dupla Mista',
};

/**
 * Forma curta, para onde "Dupla" seria redundante ou não caberia:
 * coluna CAT. da tabela, chips de filtro e cards do pódio — lugares em que
 * o contexto já deixou claro que se trata de uma dupla.
 */
export const CATEGORY_SHORT: Record<Category, string> = {
  MASCULINA: 'Masculina',
  FEMININA: 'Feminina',
  MISTA: 'Mista',
};

export const TEAM_STATUSES = ['INSCRITA', 'ATIVA', 'DESCLASSIFICADA'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  INSCRITA: 'Inscrita',
  ATIVA: 'Ativa',
  DESCLASSIFICADA: 'Desclassificada',
};

/** Estados de homologação (§22). LOCKED exige confirmação para alterar. */
export const RESULT_STATUSES = ['DRAFT', 'PUBLISHED', 'LOCKED'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export type Battery = 1 | 2;
export type WodNumber = 1 | 2 | 3;

export const WOD_META: Record<WodNumber, { name: string; cap: string; capSeconds: number; format: string }> = {
  1: { name: 'STRENGTH', cap: '16 minutos', capSeconds: 960, format: 'CARGA MÁXIMA' },
  2: { name: 'ENDURANCE', cap: '22 minutos', capSeconds: 1320, format: "AMRAP 22'" },
  3: { name: 'METCON', cap: '20 minutos', capSeconds: 1200, format: 'FOR TIME' },
};

export interface EventInfo {
  id: string;
  name: string;
  date: string;
  status: 'DRAFT' | 'LIVE' | 'FINISHED';
  liveMode: boolean;
  maintenanceMode: boolean;
}

export interface Team {
  id: string;
  eventId: string;
  teamNumber: number;
  teamName: string;
  category: Category;
  athlete1: string;
  athlete2: string;
  battery: Battery;
  status: TeamStatus;
}

/** WOD 1 — seis cargas por dupla (3 levantamentos × 2 atletas). */
export interface Wod1Result {
  teamId: string;
  strictPressAthlete1: number | null;
  strictPressAthlete2: number | null;
  backSquatAthlete1: number | null;
  backSquatAthlete2: number | null;
  deadliftAthlete1: number | null;
  deadliftAthlete2: number | null;
  status: ResultStatus;
}

/** WOD 2 — AMRAP 22': corrida (shuttle run) + assault bike. */
export interface Wod2Result {
  teamId: string;
  runKm: number | null;
  bikeKm: number | null;
  status: ResultStatus;
}

/** WOD 3 — FOR TIME, CAP 20:00. */
export interface Wod3Result {
  teamId: string;
  timeSeconds: number | null;
  completed: boolean;
  /** Reps/metros concluídos dentro do CAP quando `completed = false`. */
  volumeCompleted: number | null;
  status: ResultStatus;
}

/* ==========================================================================
   CONFIGURAÇÕES QUE A ORGANIZAÇÃO AINDA PRECISA FECHAR (§15, §26, §48)
   Nada aqui é assumido silenciosamente — tudo é editável em /admin/settings.
   ========================================================================== */

/**
 * Como pontuar duplas empatadas no MESMO valor numérico.
 *  - COMPETITION  1º, 1º, 3º  — ambas recebem 1 ponto (padrão esportivo usual)
 *  - AVERAGE      1º, 1º, 3º  — ambas recebem 1,5 ponto (média das posições)
 * A organização escolhe. Em ambos os casos o empate é sinalizado na tela.
 */
export const TIE_POINTS_MODES = ['COMPETITION', 'AVERAGE'] as const;
export type TiePointsMode = (typeof TIE_POINTS_MODES)[number];

/**
 * Como ordenar duplas que NÃO concluíram o WOD 3 dentro do CAP.
 *  - PENDING_DEFINITION  (padrão) todas depois das finalizadas, empatadas
 *                        entre si e marcadas para decisão manual.
 *                        >>> NENHUM critério é inventado. <<<
 *  - VOLUME_DESC         maior volume concluído fica à frente
 *  - TIED_LAST           todas empatadas na última posição
 */
export const DNF_POLICIES = ['PENDING_DEFINITION', 'VOLUME_DESC', 'TIED_LAST'] as const;
export type DnfPolicy = (typeof DNF_POLICIES)[number];

/**
 * A PONTUAÇÃO DO WOD 1 SOMA AS QUATRO PROVAS. SEMPRE.
 *
 *   PONTUAÇÃO DO WOD 1 = Pts 1A + Pts 1B + Pts 1C + Pts 1D
 *
 * Já existiu aqui um modo alternativo (TOTAL_ONLY) em que só a prova 1D
 * pontuava — a leitura da frase do regulamento "a dupla com maior resultado
 * total ficará em 1º lugar no Workout". A organização decidiu pela soma das
 * quatro, e a opção foi removida: configuração capaz de zerar em silêncio a
 * pontuação de três provas é risco no dia do evento, não flexibilidade.
 *
 * A coluna wod1_scoring_mode continua existindo no banco e é simplesmente
 * ignorada — não há migration a rodar.
 */

/**
 * CRITÉRIOS DE DESEMPATE DA CLASSIFICAÇÃO (§15)
 *
 * Duas duplas da mesma categoria podem terminar com a mesma pontuação total.
 * Estes são os critérios que decidem quem fica na frente — escolhidos pela
 * organização em /admin/settings e APLICADOS pelo sistema, em ordem: o
 * critério 2 só é consultado quando o 1 empata, e assim por diante.
 *
 * "Melhor colocação no WOD X" = menor pontuação naquele WOD. No WOD 3, que
 * tem uma prova só, isso é literalmente a colocação. Nos WODs 1 e 2 é a soma
 * das provas do workout (1A+1B+1C+1D e 2A+2B+2C), que é justamente a
 * colocação da dupla naquele workout.
 *
 * Dupla sem resultado no WOD do critério vai para trás — não há como
 * comparar, e presumir a favor dela seria inventar regra.
 *
 * NENHUM mantém o comportamento honesto de antes: as duplas dividem a
 * posição, a tela mostra EMPATE e a decisão é de gente.
 */
export const TIE_BREAKERS = ['NENHUM', 'WOD3', 'WOD2', 'WOD1'] as const;
export type TieBreaker = (typeof TIE_BREAKERS)[number];

export const TIE_BREAKER_LABEL: Record<TieBreaker, string> = {
  NENHUM: 'Nenhum — decisão manual',
  WOD3: 'Melhor colocação no WOD 3 — Metcon',
  WOD2: 'Melhor colocação no WOD 2 — Endurance',
  WOD1: 'Melhor colocação no WOD 1 — Strength',
};

/** Forma curta, para caber num selo de tabela. */
export const TIE_BREAKER_SHORT: Record<TieBreaker, string> = {
  NENHUM: '—',
  WOD3: 'WOD 3',
  WOD2: 'WOD 2',
  WOD1: 'WOD 1',
};

/**
 * A REGRA DO EVENTO: empate na classificação geral é decidido pela melhor
 * colocação no WOD 3.
 *
 * Decisão da organização do Nação Celebration, e por isso é o PADRÃO do
 * sistema — não algo que alguém precise lembrar de configurar antes do
 * pódio. Continua trocável em /admin/settings: escolher outro critério, ou
 * NENHUM para voltar à decisão manual, sobrescreve este padrão.
 */
export const TIE_BREAKER_PADRAO: TieBreaker = 'WOD3';

/**
 * Lê o que está guardado no banco.
 *
 * A coluna já foi texto livre: até pouco tempo o campo só REGISTRAVA a regra,
 * sem aplicá-la. Uma frase escrita ali não vira ordenação — o sistema não
 * adivinha o que ela queria dizer —, então valor irreconhecível cai no
 * `padrao` recebido, e o formulário mostra o texto antigo para conferência.
 */
export function parseTieBreaker(
  valor: string | null | undefined,
  padrao: TieBreaker = 'NENHUM',
): TieBreaker {
  const limpo = (valor ?? '').trim().toUpperCase();
  return (TIE_BREAKERS as readonly string[]).includes(limpo)
    ? (limpo as TieBreaker)
    : padrao;
}

export interface EventSettings {
  tiePointsMode: TiePointsMode;
  dnfPolicy: DnfPolicy;
  /** Critérios de desempate, aplicados nesta ordem. */
  tieBreaker1: TieBreaker;
  tieBreaker2: TieBreaker;
  tieBreaker3: TieBreaker;
  /**
   * Texto livre que estava guardado antes de os critérios virarem escolha.
   * Existe só para o formulário poder dizer "você tinha escrito isto" — o
   * motor nunca usa.
   */
  tieBreakerLegado: string | null;
  liveMode: boolean;
  maintenanceMode: boolean;
}

export const DEFAULT_SETTINGS: EventSettings = {
  tiePointsMode: 'COMPETITION',
  dnfPolicy: 'PENDING_DEFINITION',
  // A regra do evento já está decidida — ver TIE_BREAKER_PADRAO.
  tieBreaker1: TIE_BREAKER_PADRAO,
  tieBreaker2: 'NENHUM',
  tieBreaker3: 'NENHUM',
  tieBreakerLegado: null,
  liveMode: true,
  maintenanceMode: false,
};

/** Os critérios na ordem em que são consultados, já sem os vazios. */
export function criteriosDeDesempate(
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>,
): TieBreaker[] {
  return [settings.tieBreaker1, settings.tieBreaker2, settings.tieBreaker3].filter(
    (c): c is TieBreaker => c !== 'NENHUM',
  );
}

/* ==========================================================================
   RESULTADOS CALCULADOS
   ========================================================================== */

export interface RankedEntry {
  teamId: string;
  /** Valor bruto que gerou a posição (kg, km ou segundos). */
  value: number;
  rank: number;
  points: number;
  /** Há outra dupla com exatamente o mesmo valor nesta prova. */
  tied: boolean;
  /** A organização precisa decidir manualmente (empate ou DNF sem critério). */
  needsDecision: boolean;
}

export interface Wod1Score {
  teamId: string;

  /** Prova 1A — soma do Strict Press dos dois atletas. */
  strictPress: number;
  rankStrictPress: number | null;
  pointsStrictPress: number | null;

  /** Prova 1B — soma do Back Squat dos dois atletas. */
  backSquat: number;
  rankBackSquat: number | null;
  pointsBackSquat: number | null;

  /** Prova 1C — soma do Deadlift dos dois atletas. */
  deadlift: number;
  rankDeadlift: number | null;
  pointsDeadlift: number | null;

  /** Prova 1D — soma das seis cargas. */
  totalLoad: number;
  rankTotal: number | null;
  pointsTotal: number | null;

  /**
   * Pontuação do WOD 1 na classificação geral.
   * Depende de `settings.wod1ScoringMode` — ver o comentário lá.
   */
  points: number | null;

  /** Posição na prova 1D. Mantido para leitura rápida e compatibilidade. */
  rank: number | null;

  tied: boolean;
  hasResult: boolean;
}

export interface Wod2Score {
  teamId: string;
  runKm: number;
  bikeKm: number;
  totalKm: number;
  rankRun: number | null;
  pointsRun: number | null;
  rankBike: number | null;
  pointsBike: number | null;
  rankTotal: number | null;
  pointsTotal: number | null;
  /** Soma 2A + 2B + 2C — é a pontuação do WOD 2 na classificação geral. */
  points: number | null;
  tied: boolean;
  hasResult: boolean;
}

export interface Wod3Score {
  teamId: string;
  timeSeconds: number;
  completed: boolean;
  volumeCompleted: number | null;
  rank: number | null;
  points: number | null;
  tied: boolean;
  needsDecision: boolean;
  hasResult: boolean;
}

export interface StandingRow {
  team: Team;
  wod1: Wod1Score | null;
  wod2: Wod2Score | null;
  wod3: Wod3Score | null;
  /** Soma dos pontos dos WODs já pontuados. Menor = melhor. */
  totalPoints: number;
  /** Quantos WODs já têm resultado válido para esta dupla (0–3). */
  scoredWods: number;
  position: number;
  /** Outra dupla tem exatamente a mesma pontuação e completude. */
  tied: boolean;
  /** Empate que a organização precisa resolver (§15). */
  needsDecision: boolean;
  /**
   * Identificador do grupo que divide a MESMA posição.
   *
   * É o que permite recalcular a posição dentro da categoria sem reaplicar o
   * desempate: quem ficou junto no geral fica junto na categoria, e quem foi
   * separado por um critério continua separado. Sem isso, as duas telas
   * poderiam discordar sobre quem está empatado com quem.
   */
  tieGroup: number;
  /** Critério que desempatou esta dupla, quando houve empate de pontos. */
  desempatadoPor: TieBreaker | null;
}
