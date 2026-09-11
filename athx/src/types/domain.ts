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
 * Como a pontuação do WOD 1 entra na classificação geral.
 *
 *  - SUM_ALL     (padrão) Pts 1A + Pts 1B + Pts 1C + Pts 1D, do mesmo jeito
 *                que o WOD 2 soma 2A + 2B + 2C. Foi o que a organização
 *                pediu: "o WOD 1 gera 4 pontuações".
 *  - TOTAL_ONLY  apenas a prova 1D (resultado total de cargas) pontua. É o
 *                que diz a frase do regulamento "a dupla com maior resultado
 *                total ficará em 1º lugar no Workout".
 *
 * As duas leituras existem porque o regulamento e a instrução da organização
 * divergem neste ponto. A escolha fica em /admin/settings, e trocar recalcula
 * a classificação inteira. Ver docs/regras-pendentes.md.
 */
export const WOD1_SCORING_MODES = ['SUM_ALL', 'TOTAL_ONLY'] as const;
export type Wod1ScoringMode = (typeof WOD1_SCORING_MODES)[number];

export interface EventSettings {
  wod1ScoringMode: Wod1ScoringMode;
  tiePointsMode: TiePointsMode;
  dnfPolicy: DnfPolicy;
  /** Critérios de desempate da classificação geral — vazios até definição. */
  tieBreaker1: string | null;
  tieBreaker2: string | null;
  tieBreaker3: string | null;
  liveMode: boolean;
  maintenanceMode: boolean;
}

export const DEFAULT_SETTINGS: EventSettings = {
  wod1ScoringMode: 'SUM_ALL',
  tiePointsMode: 'COMPETITION',
  dnfPolicy: 'PENDING_DEFINITION',
  tieBreaker1: null,
  tieBreaker2: null,
  tieBreaker3: null,
  liveMode: true,
  maintenanceMode: false,
};

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
}
