import { todayIso } from '@/lib/today';

/** ?setor=&mes=AAAA-MM → setor válido (dos que a pessoa vê) e mês; padrão = mês seguinte a partir do dia 15. */
export function resolveParams(sp: { setor?: string; mes?: string }, sectors: { id: string }[]) {
  const today = todayIso();
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  if (Number(today.slice(8, 10)) >= 15) { month++; if (month > 12) { month = 1; year++; } }
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2020 && Number(m[1]) <= 2100) { year = Number(m[1]); month = Number(m[2]); }
  const sectorId = sectors.find((s) => s.id === sp.setor)?.id ?? sectors[0]?.id ?? null;
  return { sectorId, year, month, mes: `${year}-${String(month).padStart(2, '0')}` };
}
