import type { DnfPolicy, EventSettings, ResultStatus, Team, TiePointsMode } from '@/types/domain';
import { CATEGORIES } from '@/types/domain';
import type { Prova, ProvaResult, ProvaScore, Wod, WodEntry, WodScore } from '@/types/wod';
import { rankValues, type Direction, type RankInput } from './rank';
import { isRankable, PUBLIC_STATUSES } from './eligibility';
import {
  buscarEntrada,
  contaNaProva,
  indexarEntradas,
  resolverValores,
  type EntradasPorWod,
  type ValoresPorProva,
} from './valores';

/**
 * O MOTOR. Um só, para qualquer evento.
 *
 * Antes havia três: um que entendia de cargas, um de distâncias e um de
 * tempo. Cada WOD novo pedia um quarto. Agora existe uma regra, aplicada a
 * toda prova do evento, seja ela qual for:
 *
 *   1. resolve o valor bruto (soma dos atletas, ou soma de outras provas)
 *   2. separa quem conta: homologado, com valor, dupla não desclassificada
 *   3. em workout com CAP, quem não concluiu entra pela política configurada
 *   4. ranqueia DENTRO DA CATEGORIA, na direção da prova
 *   5. posição vira ponto: 1º = 1, 2º = 2…
 *
 * O que decide o comportamento é o CADASTRO da prova — unidade, direção,
 * origem —, não um `if` com o número do WOD.
 */

export interface MotorInput {
  teams: readonly Team[];
  wods: readonly Wod[];
  entries: readonly WodEntry[];
  results: readonly ProvaResult[];
  settings: Pick<EventSettings, 'tiePointsMode' | 'dnfPolicy'>;
  statuses?: readonly ResultStatus[];
}

export interface MotorOutput {
  /** provaId -> teamId -> pontuação daquela prova. */
  provas: Map<string, Map<string, ProvaScore>>;
  /** wodId -> teamId -> total do workout. */
  wods: Map<string, Map<string, WodScore>>;
  valores: ValoresPorProva;
}

const DIRECAO_PARA_RANK: Record<Prova['direcao'], Direction> = {
  MAIOR_VENCE: 'HIGHER_IS_BETTER',
  MENOR_VENCE: 'LOWER_IS_BETTER',
};

export function pontuarEvento(input: MotorInput): MotorOutput {
  const { teams, wods, entries, results, settings } = input;
  const statuses = input.statuses ?? PUBLIC_STATUSES;
  const tieMode = settings.tiePointsMode;
  const dnfPolicy = settings.dnfPolicy;

  const valores = resolverValores(wods, teams, results);
  const entradas = indexarEntradas(entries);
  const ranqueaveis = new Set(teams.filter(isRankable).map((t) => t.id));

  const provas = new Map<string, Map<string, ProvaScore>>();

  for (const wod of wods) {
    for (const prova of wod.provas) {
      provas.set(
        prova.id,
        pontuarProva({
          prova,
          wod,
          teams,
          valores,
          entradas,
          ranqueaveis,
          statuses,
          tieMode,
          dnfPolicy,
        }),
      );
    }
  }

  return { provas, wods: somarPorWod(wods, teams, entradas, provas), valores };
}

/* ==========================================================================
   UMA PROVA
   ========================================================================== */

interface ArgsProva {
  prova: Prova;
  wod: Wod;
  teams: readonly Team[];
  valores: ValoresPorProva;
  entradas: EntradasPorWod;
  ranqueaveis: ReadonlySet<string>;
  statuses: readonly ResultStatus[];
  tieMode: TiePointsMode;
  dnfPolicy: DnfPolicy;
}

function pontuarProva(args: ArgsProva): Map<string, ProvaScore> {
  const { prova, wod, teams, valores, entradas, ranqueaveis, statuses, tieMode, dnfPolicy } = args;
  const doProva = valores.get(prova.id) ?? new Map<string, number | null>();

  const scores = new Map<string, ProvaScore>();
  for (const team of teams) {
    scores.set(team.id, {
      provaId: prova.id,
      teamId: team.id,
      valor: doProva.get(team.id) ?? null,
      rank: null,
      points: null,
      tied: false,
      needsDecision: false,
      hasResult: false,
    });
  }

  // A disputa é dentro da categoria: 5 duplas na masculina, no máximo 5
  // pontos para uma dupla masculina nesta prova.
  for (const categoria of CATEGORIES) {
    const daCategoria = teams.filter(
      (t) => t.category === categoria && ranqueaveis.has(t.id),
    );
    if (daCategoria.length === 0) continue;

    const elegiveis = daCategoria.filter((t) =>
      contaNaProva(buscarEntrada(entradas, wod.id, t.id), doProva.get(t.id) ?? null, statuses, wod),
    );
    if (elegiveis.length === 0) continue;

    // Workout com CAP: quem concluiu disputa pelo valor; quem não concluiu
    // entra atrás, pela política escolhida pela organização (§13/§48).
    const concluiram = wod.permiteCap
      ? elegiveis.filter((t) => {
          const e = buscarEntrada(entradas, wod.id, t.id);
          return (e?.concluiu ?? false) && (doProva.get(t.id) ?? null) !== null;
        })
      : elegiveis;
    const incompletas = wod.permiteCap
      ? elegiveis.filter((t) => !concluiram.includes(t))
      : [];

    const entradasRank: RankInput[] = concluiram.map((t) => ({
      teamId: t.id,
      value: doProva.get(t.id) ?? 0,
    }));

    for (const r of rankValues(entradasRank, DIRECAO_PARA_RANK[prova.direcao], tieMode)) {
      const atual = scores.get(r.teamId);
      if (!atual) continue;
      scores.set(r.teamId, {
        ...atual,
        rank: r.rank,
        points: r.points,
        tied: r.tied,
        needsDecision: r.tied,
        hasResult: true,
      });
    }

    if (incompletas.length > 0) {
      aplicarPoliticaDeIncompletos({
        incompletas,
        offset: concluiram.length,
        totalElegiveis: elegiveis.length,
        entradas,
        wodId: wod.id,
        dnfPolicy,
        tieMode,
        scores,
      });
    }
  }

  return scores;
}

/* ==========================================================================
   QUEM NÃO CONCLUIU DENTRO DO CAP (§13 / §48)
   Nada é assumido: a regra vem de event_settings.dnfPolicy.
   ========================================================================== */

interface ArgsIncompletas {
  incompletas: readonly Team[];
  offset: number;
  totalElegiveis: number;
  entradas: EntradasPorWod;
  wodId: string;
  dnfPolicy: DnfPolicy;
  tieMode: TiePointsMode;
  scores: Map<string, ProvaScore>;
}

function aplicarPoliticaDeIncompletos(args: ArgsIncompletas): void {
  const { incompletas, offset, totalElegiveis, entradas, wodId, dnfPolicy, tieMode, scores } = args;

  const gravar = (teamId: string, campos: Partial<ProvaScore>) => {
    const atual = scores.get(teamId);
    if (!atual) return;
    scores.set(teamId, { ...atual, ...campos, hasResult: true });
  };

  if (dnfPolicy === 'VOLUME_DESC') {
    const porVolume: RankInput[] = incompletas.map((t) => ({
      teamId: t.id,
      value: buscarEntrada(entradas, wodId, t.id)?.volume ?? 0,
    }));
    for (const r of rankValues(porVolume, 'HIGHER_IS_BETTER', tieMode)) {
      gravar(r.teamId, {
        rank: r.rank + offset,
        points: r.points + offset,
        tied: r.tied,
        needsDecision: r.tied,
      });
    }
    return;
  }

  if (dnfPolicy === 'TIED_LAST') {
    for (const t of incompletas) {
      gravar(t.id, {
        rank: totalElegiveis,
        points: totalElegiveis,
        tied: incompletas.length > 1,
        needsDecision: false,
      });
    }
    return;
  }

  // PENDING_DEFINITION — atrás de quem concluiu, empatadas entre si,
  // sinalizadas para a organização decidir.
  const rank = offset + 1;
  const points =
    tieMode === 'AVERAGE' && incompletas.length > 1
      ? (rank + (rank + incompletas.length - 1)) / 2
      : rank;

  for (const t of incompletas) {
    gravar(t.id, {
      rank,
      points,
      tied: incompletas.length > 1,
      needsDecision: true,
    });
  }
}

/* ==========================================================================
   TOTAL DE CADA WOD
   ========================================================================== */

/**
 * A pontuação do WOD é a soma das provas dele que pontuam, e a posição no
 * workout sai dessa soma — ranqueada dentro da categoria, como tudo.
 */
function somarPorWod(
  wods: readonly Wod[],
  teams: readonly Team[],
  entradas: EntradasPorWod,
  provas: Map<string, Map<string, ProvaScore>>,
): Map<string, Map<string, WodScore>> {
  const saida = new Map<string, Map<string, WodScore>>();

  for (const wod of wods) {
    const doWod = new Map<string, WodScore>();
    const queContam = wod.provas.filter((p) => p.pontua);

    for (const team of teams) {
      const entrada = buscarEntrada(entradas, wod.id, team.id);
      const pontos = queContam.map((p) => provas.get(p.id)?.get(team.id) ?? null);
      const todasPontuadas =
        queContam.length > 0 && pontos.every((s) => s?.hasResult && s.points !== null);

      doWod.set(team.id, {
        wodId: wod.id,
        teamId: team.id,
        points: todasPontuadas
          ? pontos.reduce<number>((soma, s) => soma + (s?.points ?? 0), 0)
          : null,
        rank: null,
        hasResult: todasPontuadas,
        concluiu: entrada?.concluiu ?? false,
        volume: entrada?.volume ?? null,
      });
    }

    // Posição no workout: menor soma de pontos é melhor, dentro da categoria.
    for (const categoria of CATEGORIES) {
      const entradasRank: RankInput[] = teams
        .filter((t) => t.category === categoria)
        .map((t) => ({ teamId: t.id, score: doWod.get(t.id) }))
        .filter((x): x is { teamId: string; score: WodScore } => Boolean(x.score?.hasResult))
        .map((x) => ({ teamId: x.teamId, value: x.score.points ?? 0 }));

      for (const r of rankValues(entradasRank, 'LOWER_IS_BETTER')) {
        const atual = doWod.get(r.teamId);
        if (atual) doWod.set(r.teamId, { ...atual, rank: r.rank });
      }
    }

    saida.set(wod.id, doWod);
  }

  return saida;
}

/** Reexportado para quem só precisa dos resultados crus tipados. */
export type { ProvaResult, WodEntry };
