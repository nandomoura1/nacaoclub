import { roundCents } from './money';

/**
 * Contribuição individualizada (Tabela 2 da aba do mês):
 *  - a Lanchonete assume `snackBarPct` (30%) do total;
 *  - o resto é dividido pelo nº de alunos/colaboradores ativos de cada centro de custo.
 * Cada cota é arredondada sozinha (como as células da planilha) e a sobra de
 * centavos vai para a Lanchonete, para a soma bater exatamente com o total.
 * O percentual é a fatia real do dinheiro (valor ÷ total) — a planilha dividia
 * alunos por Σalunos × 1,667, o que não batia com o valor cobrado.
 */
export interface RateioCenter { id: string; headcount: number; isSnackBar: boolean }
export interface RateioRow { id: string; headcount: number; cents: number; ratio: number }
export interface RateioResult { rows: RateioRow[]; perHead: number; headcount: number; error: string | null }

export function allocate(totalCents: number, centers: RateioCenter[], snackBarPct: number): RateioResult {
  const snack = centers.filter((c) => c.isSnackBar);
  const others = centers.filter((c) => !c.isSnackBar);
  const headcount = others.reduce((s, c) => s + Math.max(0, c.headcount), 0);
  const empty = { rows: centers.map((c) => ({ id: c.id, headcount: c.headcount, cents: 0, ratio: 0 })), perHead: 0, headcount };
  if (totalCents <= 0) return { ...empty, error: null };
  if (snack.length > 1) return { ...empty, error: 'Só um centro de custo pode ser a Lanchonete (percentual fixo).' };
  const pct = snack.length ? Math.min(100, Math.max(0, snackBarPct)) : 0;
  const rest = (totalCents * (100 - pct)) / 100;
  if (rest > 0 && headcount <= 0) return { ...empty, error: 'Informe o nº de alunos/colaboradores de pelo menos um centro de custo.' };

  const perHeadCents = headcount ? rest / headcount : 0;
  const cents = new Map<string, number>();
  for (const c of others) cents.set(c.id, roundCents(perHeadCents * Math.max(0, c.headcount)));
  if (snack[0]) cents.set(snack[0].id, roundCents((totalCents * pct) / 100));
  // Sobra de arredondamento: Lanchonete (ou a maior cota, sem Lanchonete).
  const residual = totalCents - [...cents.values()].reduce((s, v) => s + v, 0);
  if (residual) {
    const target = snack[0]?.id ?? [...cents.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    cents.set(target, cents.get(target)! + residual);
  }
  return {
    rows: centers.map((c) => ({ id: c.id, headcount: c.headcount, cents: cents.get(c.id) ?? 0, ratio: (cents.get(c.id) ?? 0) / totalCents })),
    perHead: perHeadCents / 100,
    headcount,
    error: null,
  };
}
