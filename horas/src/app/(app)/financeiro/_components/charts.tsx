import type { Ind } from '@/domain/financeiro/metrics';
import { compactBRL, fmtValue } from './fmt';

/**
 * Gráficos do Financeiro — SVG puro, uma cor (azul Nação; o último mês em
 * navy), dica nativa no hover (<title>), grade recessiva, um eixo só.
 * Mês sem dado vira lacuna (nunca zero inventado).
 */
const BLUE = '#0169E9';
const NAVY = '#022B57';
const GRID = '#E2E8F0';
const INK = '#64748B';

const tick = (v: number, unit: Ind['unit']) => (unit === 'BRL' ? compactBRL(v) : unit === 'PCT' ? `${Math.round(v * 100)}%` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));

export function SeriesBars({ data, unit, label }: { data: { label: string; value: number | null }[]; unit: Ind['unit']; label: string }) {
  const vals = data.map((d) => d.value).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="py-6 text-center text-sm text-tinta-suave">Sem meses aprovados com este dado.</p>;
  const W = 640, H = 200, padL = 58, padB = 26, padT = 20;
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals) * 1.12 || 1;
  const step = (W - padL) / data.length;
  const bw = Math.max(6, Math.min(34, step - 6));
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const ticks = [...new Set([lo, 0, hi / 1.12 / 2, hi / 1.12])];
  const lastI = data.map((d) => d.value !== null).lastIndexOf(true);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK}>{tick(t, unit)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * step + (step - bw) / 2;
        const base = y(0);
        if (d.value === null) return <text key={d.label} x={x + bw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill={INK}>{d.label}</text>;
        const top = Math.min(y(d.value), base);
        const h = Math.max(1, Math.abs(y(d.value) - base));
        const r = Math.min(4, bw / 2, h);
        const up = d.value >= 0;
        const path = up
          ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`
          : `M${x},${base} V${base + h - r} Q${x},${base + h} ${x + r},${base + h} H${x + bw - r} Q${x + bw},${base + h} ${x + bw},${base + h - r} V${base} Z`;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${fmtValue(d.value, unit)}`}</title>
            <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent" />
            <path d={path} fill={i === lastI ? NAVY : BLUE} />
            <text x={x + bw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill={INK}>{d.label}</text>
            {i === lastI && <text x={x + bw / 2} y={up ? top - 6 : base + h + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={NAVY}>{tick(d.value, unit)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontais (partes de um total) em HTML — quebra bem no celular. */
export function ShareBars({ rows }: { rows: { label: string; cents: number; ratio?: number | null; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.cents)));
  if (!rows.length) return <p className="text-sm italic text-tinta-fraca">Dado não informado</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="min-w-0" title={`${r.label}: ${fmtValue(r.cents, 'BRL')}`}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-tinta">{r.label}</span>
            {r.note && <span className="text-xs text-tinta-suave">{r.note}</span>}
            <span className="font-semibold tabular-nums text-navy">{fmtValue(r.cents, 'BRL')}</span>
            {r.ratio !== undefined && <span className="w-14 text-right text-xs tabular-nums text-tinta-suave">{r.ratio === null ? '—' : fmtValue(r.ratio, 'PCT')}</span>}
          </div>
          <div className="mt-1 h-2 rounded-full bg-fundo print:border print:border-borda"><div className="h-2 rounded-full bg-nacao" style={{ width: `${Math.max(1, (Math.abs(r.cents) / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
