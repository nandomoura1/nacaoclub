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

/**
 * A bateria é um número qualquer: quantas o evento tem sai de
 * event_settings.baterias, editável na tela de WODs.
 */
export type Battery = number;
/**
 * O evento não tem mais número de WOD cravado no tipo. Um WOD é uma linha
 * da tabela `wods`, criada em /admin/wods — ver src/types/wod.ts.
 */

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
export const SEM_DESEMPATE = 'NENHUM' as const;

/**
 * Um critério é `NENHUM` ou `WOD<numero>` — "melhor colocação no WOD 3" vira
 * `WOD3`. Como os WODs agora são cadastrados pela organização, a lista de
 * opções é montada a partir dos WODs do evento, não de um enum fixo.
 */
export type TieBreaker = typeof SEM_DESEMPATE | `WOD${number}`;

const FORMATO_WOD = /^WOD(\d{1,3})$/;

export function ehTieBreaker(valor: string): valor is TieBreaker {
  return valor === SEM_DESEMPATE || FORMATO_WOD.test(valor);
}

/** O número do WOD a que o critério se refere, ou null para NENHUM. */
export function wodDoCriterio(criterio: TieBreaker): number | null {
  const m = FORMATO_WOD.exec(criterio);
  return m?.[1] ? Number(m[1]) : null;
}

export function tieBreakerDoWod(numero: number): TieBreaker {
  return `WOD${numero}`;
}

/** Rótulo curto, para caber num selo de tabela. */
export function tieBreakerCurto(criterio: TieBreaker): string {
  const n = wodDoCriterio(criterio);
  return n === null ? '—' : `WOD ${n}`;
}

/**
 * A REGRA DO EVENTO: empate na classificação da categoria é decidido pela
 * melhor colocação no ÚLTIMO WOD do evento — o WOD 3 na etapa de setembro.
 *
 * Decisão da organização, e por isso é o padrão. Continua trocável em
 * /admin/settings, inclusive para NENHUM, que devolve a decisão à mesa.
 */
export const TIE_BREAKER_PADRAO: TieBreaker = 'WOD3';

/**
 * Lê o que está guardado no banco.
 *
 * A coluna já foi texto livre: houve uma época em que o campo só REGISTRAVA
 * a regra, sem aplicá-la. Valor irreconhecível cai no `padrao` recebido, e o
 * formulário mostra o texto antigo para conferência.
 */
export function parseTieBreaker(
  valor: string | null | undefined,
  padrao: TieBreaker = SEM_DESEMPATE,
): TieBreaker {
  const limpo = (valor ?? '').trim().toUpperCase();
  return ehTieBreaker(limpo) ? limpo : padrao;
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
  /** Quantas baterias o evento tem. */
  baterias: number;
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
  baterias: 2,
  liveMode: true,
  maintenanceMode: false,
};

/** Os critérios na ordem em que são consultados, já sem os vazios. */
export function criteriosDeDesempate(
  settings: Pick<EventSettings, 'tieBreaker1' | 'tieBreaker2' | 'tieBreaker3'>,
): TieBreaker[] {
  return [settings.tieBreaker1, settings.tieBreaker2, settings.tieBreaker3].filter(
    (c): c is TieBreaker => c !== SEM_DESEMPATE,
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




export interface StandingRow {
  team: Team;
  /** Pontuação de cada prova do evento, indexada por id da prova. */
  provas: Record<string, import('./wod').ProvaScore>;
  /** Total de cada WOD, indexado por id do WOD. */
  wods: Record<string, import('./wod').WodScore>;
  /** Soma dos pontos de todas as provas que pontuam. Menor = melhor. */
  totalPoints: number;
  /** Quantos WODs já têm resultado válido para esta dupla. */
  scoredWods: number;
  /** Quantos WODs o evento tem — para a tela dizer "2 de 3". */
  totalWods: number;
  /**
   * Posição na classificação GERAL — as três categorias misturadas.
   *
   * Referência, não disputa: ninguém compete contra outra categoria, então
   * aqui o critério de desempate não age e duplas com a mesma pontuação
   * dividem a posição.
   */
  position: number;
  /**
   * Posição DENTRO DA CATEGORIA — a que vale, a que vai ao pódio.
   * É aqui que o critério de desempate é aplicado (§15).
   */
  categoryPosition: number;
  /** Outra dupla DA MESMA CATEGORIA tem a mesma pontuação e completude. */
  tied: boolean;
  /** Empate que nenhum critério separou: a organização decide (§15). */
  needsDecision: boolean;
  /** Critério que desempatou esta dupla dentro da categoria. */
  desempatadoPor: TieBreaker | null;
}
