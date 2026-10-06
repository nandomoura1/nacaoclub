import { formatBRL } from '@/domain/condominio/money';

/**
 * Gráficos do painel do Condomínio — SVG puro, uma cor só (azul Nação; o mês
 * mais recente em navy). Dica nativa no hover (<title>) e tabela equivalente
 * em "ver em tabela". Sem eixo duplo, grade recessiva, rótulo só no destaque.
 */
const BLUE = '#0169E9';
const NAVY = '#022B57';
const GRID = '#E2E8F0';
const INK = '#64748B';

const compact = (cents: number) => {
  const r = cents / 100;
  return r >= 1000 ? `R$ ${(r / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatBRL(cents);
};

/** Barras verticais (evolução mensal). Cantos arredondados no topo, ancoradas na base. */
export function MonthBars({ data, label }: { data: { label: string; cents: number }[]; label: string }) {
  if (!data.length) return <p className="text-sm text-tinta-suave">Sem competências fechadas no período.</p>;
  const W = 640, H = 220, padL = 52, padB = 26, padT = 18;
  const max = Math.max(...data.map((d) => d.cents)) * 1.1 || 1;
  const step = (W - padL) / data.length;
  const bw = Math.max(6, Math.min(34, step - 6));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t / 1.1 / 100000) * 100000).filter((v, i, a) => a.indexOf(v) === i);
  const lastI = data.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK}>{compact(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * step + (step - bw) / 2;
        const top = y(d.cents);
        const h = Math.max(0, H - padB - top);
        const r = Math.min(4, bw / 2, h);
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${formatBRL(d.cents)}`}</title>
            <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent" />
            <path d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - padB} Z`} fill={i === lastI ? NAVY : BLUE} />
            {(data.length <= 12 || i % 2 === lastI % 2) && <text x={x + bw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill={INK}>{d.label}</text>}
            {i === lastI && <text x={x + bw / 2} y={top - 5} textAnchor="end" fontSize={11} fontWeight={700} fill={NAVY}>{compact(d.cents)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontais (partes de um total). HTML: quebra bem no celular. */
export function HBars({ rows, total }: { rows: { label: string; cents: number; note?: string }[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="min-w-0" title={`${r.label}: ${formatBRL(r.cents)}`}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-tinta">{r.label}</span>
            {r.note && <span className="text-xs text-tinta-suave">{r.note}</span>}
            <span className="font-semibold tabular-nums text-navy">{formatBRL(r.cents)}</span>
            {total ? <span className="w-12 text-right text-xs tabular-nums text-tinta-suave">{((r.cents / total) * 100).toFixed(0)}%</span> : null}
          </div>
          <div className="mt-1 h-2 rounded-full bg-fundo"><div className="h-2 rounded-full bg-nacao" style={{ width: `${Math.max(1, (r.cents / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Linha curta por parceiro (small multiples: cada um na própria escala). */
export function Spark({ points, unit }: { points: { label: string; value: number }[]; unit: string }) {
  const W = 220, H = 56, pad = 6;
  if (points.length < 2) return <p className="text-xs text-tinta-suave">Poucos meses para a linha.</p>;
  const max = Math.max(...points.map((p) => p.value)) || 1;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad - 8);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" role="img" aria-label={`${points.length} meses, último ${last.value} ${unit}`}>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke={GRID} />
      <path d={d} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.label}><title>{`${p.label}: ${p.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ${unit}`}</title><circle cx={x(i)} cy={y(p.value)} r={7} fill="transparent" /></g>
      ))}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} fill={NAVY} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
