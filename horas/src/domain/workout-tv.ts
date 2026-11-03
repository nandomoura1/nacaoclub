import { estimateDayLines, KIND, studentBlock, type BlockKind, type WorkoutBlockData } from './workout';

/**
 * Treino na TV do box (puro): versão do aluno, com as fases rápidas
 * (mobilidade, warm-up, core) numa faixa de tempos e os blocos detalhados
 * (força, técnica, WOD…) em colunas. A letra é a maior que cabe sem cortar.
 */

export interface TvColumn { blocks: WorkoutBlockData[] }
export interface TvLayout {
  /** Faixa do topo, na ordem da aula: "MOBILIDADE 5'", "WARM-UP 10'". */
  quick: { label: string; minutes: number | null; title: string | null }[];
  columns: TvColumn[];
  /** Tamanho da letra do corpo, em vh (altura da tela). */
  fontVh: number;
  totalMinutes: number;
}

const SCREEN_W_VH = 177.7; // 16:9
const BODY_H_VH = 64; // sobra para cabeçalho, faixa de tempos e rodapé
const MAX_COLUMNS = 3;

const linesOf = (blocks: WorkoutBlockData[], cpl: number) => estimateDayLines({ date: '2000-01-01', title: null, blocks }, cpl) - 1.6;

/** Divide em `n` grupos seguidos (a ordem da aula se mantém) com a coluna mais alta o menor possível. */
function split(blocks: WorkoutBlockData[], n: number, cpl: number): WorkoutBlockData[][] {
  if (n <= 1) return [blocks];
  let best: WorkoutBlockData[][] = [blocks];
  let bestH = Infinity;
  for (let i = 1; i <= blocks.length - n + 1; i++) {
    const rest = split(blocks.slice(i), n - 1, cpl);
    const groups = [blocks.slice(0, i), ...rest];
    const h = Math.max(...groups.map((g) => linesOf(g, cpl)));
    if (h < bestH) { bestH = h; best = groups; }
  }
  return best;
}

/**
 * Opções da área do treino. Padrão = tela inteira em até 3 colunas.
 * Com cronômetro: `{ widthVh: 92, bodyVh: 70, maxColumns: 1 }` (coluna da direita, ao lado do relógio).
 */
export interface TvLayoutOptions {
  widthVh?: number; bodyVh?: number; maxColumns?: number;
  /**
   * Só estes tipos aparecem detalhados; os demais viram etiqueta com o tempo (como o warm-up).
   * Se o dia não tiver nenhum deles (ex.: Futevôlei), vale o padrão — a tela não fica vazia.
   */
  detailedKinds?: BlockKind[];
}

export function tvLayout(blocks: WorkoutBlockData[], opts: TvLayoutOptions = {}): TvLayout {
  const width = opts.widthVh ?? SCREEN_W_VH - 8;
  const bodyH = opts.bodyVh ?? BODY_H_VH;
  const student = blocks.map(studentBlock);
  const only = opts.detailedKinds && student.some((b) => opts.detailedKinds!.includes(b.kind)) ? opts.detailedKinds : null;
  const isDetailed = (b: WorkoutBlockData) => (only ? only.includes(b.kind) : KIND[b.kind].detailed);
  const quick = student.filter((b) => !isDetailed(b)).map((b) => ({ label: b.kind === 'OUTRO' && b.title ? b.title : KIND[b.kind].label, minutes: b.durationMin, title: b.title }));
  const main = student.filter(isDetailed);
  const n = Math.max(1, Math.min(opts.maxColumns ?? MAX_COLUMNS, main.length));
  const colW = (width - 3 * (n - 1)) / n;
  let fontVh = 1.8;
  let columns: WorkoutBlockData[][] = [main];
  for (let size = 4.6; size >= 1.8; size -= 0.1) {
    const cpl = Math.floor(colW / (size * 0.55));
    const groups = split(main, n, cpl);
    const worst = Math.max(0, ...groups.map((g) => linesOf(g, cpl)));
    columns = groups;
    if (worst * size * 1.3 <= bodyH) { fontVh = Math.round(size * 10) / 10; break; }
  }
  return {
    quick,
    columns: columns.filter((c) => c.length).map((c) => ({ blocks: c })),
    fontVh,
    totalMinutes: blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0),
  };
}

/** Qual dia a tela mostra: o fixado (enquanto não passou) ou hoje. */
export function screenDate(pinned: string | null, today: string): { date: string; pinned: boolean } {
  return pinned && pinned >= today ? { date: pinned, pinned: true } : { date: today, pinned: false };
}
