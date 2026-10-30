/**
 * NAÇÃO ATHX — WODs E PROVAS COMO DADO, NÃO COMO CÓDIGO.
 *
 * Até esta versão o evento estava cravado: três WODs, oito provas, uma
 * tabela por WOD com as colunas daquele workout (seis cargas, corrida e
 * bike, tempo). Montar uma etapa nova exigia programador.
 *
 * Agora o evento é descrito por dois objetos:
 *
 *   WOD    um workout — nome, formato, CAP, prescrição, regras
 *   PROVA  uma coisa que gera ranking e pontos dentro daquele WOD
 *
 * Um WOD tem quantas provas a organização quiser, e a organização monta
 * tudo em /admin/wods. O motor de pontuação não conhece "1A" nem "corrida":
 * ele percorre as provas do evento e aplica a mesma regra em todas.
 */

/* ==========================================================================
   COMO A PROVA É MEDIDA
   ========================================================================== */

/**
 * A unidade decide como o número é DIGITADO e EXIBIDO — nunca como é
 * ranqueado. Quem decide o ranqueamento é a direção.
 */
export const UNIDADES = ['KG', 'KM', 'METROS', 'SEGUNDOS', 'REPS', 'CALORIAS'] as const;
export type Unidade = (typeof UNIDADES)[number];

export const UNIDADE_LABEL: Record<Unidade, string> = {
  KG: 'Carga (kg)',
  KM: 'Distância (km)',
  METROS: 'Distância (m)',
  SEGUNDOS: 'Tempo (mm:ss)',
  REPS: 'Repetições',
  CALORIAS: 'Calorias',
};

/** Sufixo curto, para o campo de lançamento e para a tabela. */
export const UNIDADE_SUFIXO: Record<Unidade, string> = {
  KG: 'kg',
  KM: 'km',
  METROS: 'm',
  SEGUNDOS: '',
  REPS: 'reps',
  CALORIAS: 'cal',
};

/** Quantas casas decimais o lançamento aceita. */
export const UNIDADE_CASAS: Record<Unidade, number> = {
  KG: 2,
  KM: 3,
  METROS: 0,
  SEGUNDOS: 0,
  REPS: 0,
  CALORIAS: 0,
};

export const DIRECOES = ['MAIOR_VENCE', 'MENOR_VENCE'] as const;
export type Direcao = (typeof DIRECOES)[number];

export const DIRECAO_LABEL: Record<Direcao, string> = {
  MAIOR_VENCE: 'Maior resultado vence',
  MENOR_VENCE: 'Menor resultado vence',
};

/**
 * De onde sai o número da prova.
 *
 *   DIGITADA   o juiz lança
 *   SOMA       o sistema soma outras provas do mesmo WOD (a 1D é a soma de
 *              1A, 1B e 1C; a 2C é a soma de 2A e 2B). Prova calculada nunca
 *              é digitada, e por isso nunca sai errada por engano de digitação.
 */
export const ORIGENS = ['DIGITADA', 'SOMA'] as const;
export type Origem = (typeof ORIGENS)[number];

export const ORIGEM_LABEL: Record<Origem, string> = {
  DIGITADA: 'Lançada pelo juiz',
  SOMA: 'Calculada — soma de outras provas',
};

/* ==========================================================================
   A PROVA
   ========================================================================== */

export interface Prova {
  id: string;
  wodId: string;
  /** Código curto que aparece na tabela: 1A, 2C, 3… */
  codigo: string;
  descricao: string;
  /** Texto livre explicando o critério, exibido na página do WOD. */
  criterio: string | null;
  unidade: Unidade;
  direcao: Direcao;
  origem: Origem;
  /**
   * true quando o resultado é lançado em DOIS campos, um por atleta, e o
   * valor da prova é a soma. É o caso das cargas: cada atleta busca a sua.
   */
  porAtleta: boolean;
  /** Códigos das provas somadas quando origem = SOMA. */
  componentes: string[];
  /** false deixa a prova visível e ranqueada, mas fora do total do evento. */
  pontua: boolean;
  ordem: number;
}

/* ==========================================================================
   O WOD
   ========================================================================== */

/** Um bloco da prescrição: "0–5 min · 1RM Strict Press". */
export interface WodBloco {
  ordem: number;
  janela: string;
  movimento: string;
  detalhe: string | null;
  masculino: string | null;
  feminino: string | null;
}

export interface Wod {
  id: string;
  eventId: string;
  /** Número de exibição e prefixo dos códigos das provas. */
  numero: number;
  nome: string;
  /** "CARGA MÁXIMA", "AMRAP 22'", "FOR TIME"… */
  formato: string | null;
  /** null quando o workout não tem CAP. */
  capSegundos: number | null;
  resumo: string | null;
  /**
   * true em workout com tempo limite onde a dupla pode NÃO concluir. Liga o
   * campo "concluiu" e o volume parcial no lançamento, e faz a política de
   * incompletos (event_settings.dnfPolicy) valer para as provas deste WOD.
   */
  permiteCap: boolean;
  blocos: WodBloco[];
  regras: string[];
  /** Regras que a organização ainda não definiu (§48). */
  pendencias: string[];
  ordem: number;
  provas: Prova[];
}

/* ==========================================================================
   O QUE A DUPLA FEZ
   ========================================================================== */

/**
 * Uma dupla em um WOD: homologação e, em workout com CAP, se concluiu.
 *
 * Homologação é do WOD inteiro, não de cada prova — publicar o WOD 1 publica
 * as quatro provas dele de uma vez, que é como a organização trabalha.
 */
export interface WodEntry {
  wodId: string;
  teamId: string;
  status: import('./domain').ResultStatus;
  /** Só faz sentido quando o WOD tem permiteCap. */
  concluiu: boolean;
  /** Volume concluído dentro do CAP quando não concluiu. */
  volume: number | null;
}

/** O valor de uma dupla em uma prova. */
export interface ProvaResult {
  provaId: string;
  teamId: string;
  /** Preenchidos quando a prova é porAtleta. */
  valorAtleta1: number | null;
  valorAtleta2: number | null;
  /** Valor digitado quando a prova NÃO é porAtleta. */
  valor: number | null;
}

/* ==========================================================================
   O QUE O MOTOR DEVOLVE
   ========================================================================== */

export interface ProvaScore {
  provaId: string;
  teamId: string;
  /** O número que gerou a posição, já somado/calculado. */
  valor: number | null;
  rank: number | null;
  points: number | null;
  tied: boolean;
  needsDecision: boolean;
  hasResult: boolean;
}

/** Totais de um WOD para uma dupla: a soma das provas daquele workout. */
export interface WodScore {
  wodId: string;
  teamId: string;
  points: number | null;
  /** Posição no workout, derivada da soma dos pontos das provas dele. */
  rank: number | null;
  hasResult: boolean;
  concluiu: boolean;
  volume: number | null;
}

/* ==========================================================================
   AJUDANTES
   ========================================================================== */

/** Todas as provas do evento, na ordem de exibição. */
export function todasAsProvas(wods: readonly Wod[]): Prova[] {
  return [...wods]
    .sort((a, b) => a.ordem - b.ordem || a.numero - b.numero)
    .flatMap((w) => [...w.provas].sort((a, b) => a.ordem - b.ordem));
}

/** As provas que somam no total do evento. */
export function provasQuePontuam(wods: readonly Wod[]): Prova[] {
  return todasAsProvas(wods).filter((p) => p.pontua);
}

export function buscarWod(wods: readonly Wod[], wodId: string): Wod | undefined {
  return wods.find((w) => w.id === wodId);
}

/**
 * A fórmula do total, escrita como a organização fala: "1A + 1B + … + 3".
 * Usada nos cabeçalhos para que ninguém precise confiar na nossa palavra.
 */
export function formulaDoTotal(wods: readonly Wod[]): string {
  const codigos = provasQuePontuam(wods).map((p) => p.codigo);
  return codigos.length > 0 ? codigos.join(' + ') : '—';
}

/** CAP em texto, para cabeçalho: 960 -> "16 minutos". */
export function capEmTexto(capSegundos: number | null): string | null {
  if (capSegundos === null) return null;
  const minutos = Math.floor(capSegundos / 60);
  const segundos = capSegundos % 60;
  if (segundos === 0) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
  return `${minutos}:${String(segundos).padStart(2, '0')} min`;
}

/* ==========================================================================
   A PROGRAMAÇÃO DO DIA
   ========================================================================== */

/**
 * Um momento do dia. A linha de um workout aponta para o WOD e a bateria;
 * briefing, conferência e pódio não apontam para nada.
 */
export interface AgendaItem {
  id: string;
  ordem: number;
  hora: string;
  titulo: string;
  detalhe: string | null;
  /** Sub-itens, como o conteúdo do briefing. */
  itens: string[];
  /** Observação da organização, como o intervalo entre baterias. */
  nota: string | null;
  wodId: string | null;
  bateria: number | null;
  destaque: boolean;
}

/**
 * Os horários de uma bateria, na ordem dos WODs.
 *
 * É o que o atleta abre o celular para descobrir na manhã do evento:
 * "eu sou bateria 1 — então entro 09h00, 09h30 e 10h12".
 */
export function horariosDaBateria(
  agenda: readonly AgendaItem[],
  wods: readonly Wod[],
  bateria: number,
): { wod: Wod; hora: string }[] {
  const porId = new Map(wods.map((w) => [w.id, w]));

  return agenda
    .filter((a) => a.bateria === bateria && a.wodId !== null)
    .map((a) => ({ wod: porId.get(a.wodId as string), hora: a.hora }))
    .filter((x): x is { wod: Wod; hora: string } => x.wod !== undefined)
    .sort((a, b) => a.wod.ordem - b.wod.ordem || a.wod.numero - b.wod.numero);
}

/** As baterias que a agenda menciona, em ordem. */
export function bateriasDaAgenda(agenda: readonly AgendaItem[]): number[] {
  return [...new Set(agenda.map((a) => a.bateria).filter((b): b is number => b !== null))].sort(
    (a, b) => a - b,
  );
}
