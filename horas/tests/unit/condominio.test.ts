import { describe, expect, it } from 'vitest';
import { consumption, consumptionAlert, energyCharge } from '@/domain/condominio/energy';
import { commonArea, iptuLabel, iptuParcelCents, parcelOf } from '@/domain/condominio/iptu';
import { allocate } from '@/domain/condominio/rateio';
import { activeDays, computePeriod, type PeriodCenter, type PeriodInput } from '@/domain/condominio/period';
import { formatBRL, parseBRL, roundCents } from '@/domain/condominio/money';
import { addMonths, defaultDueDate, monthLabel, suggestedMonth } from '@/domain/condominio/months';

/** Números fictícios (a conferência com a planilha real roda fora do repositório). */
describe('Condomínio Nação — motor', () => {
  it('dinheiro e competência: meio centavo para cima; cobra o mês vencido com vencimento dia 20', () => {
    expect(roundCents(0.5)).toBe(1);
    expect(roundCents(150.49999999)).toBe(150);
    expect(roundCents(-2.5)).toBe(-3);
    expect(formatBRL(213675)).toBe('R$ 2.136,75');
    expect(parseBRL('2.136,75')).toBe(213675);
    expect(parseBRL('R$ 10')).toBe(1000);
    expect(parseBRL('')).toBeNull();
    expect(suggestedMonth('2026-10-06')).toBe('2026-09');
    expect(defaultDueDate('2026-09', 20)).toBe('2026-10-20');
    expect(defaultDueDate('2026-01', 31)).toBe('2026-02-28');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-08')).toBe('08/2026');
  });

  it('energia: consumo × tarifa × bandeira; troca de relógio; leitura menor bloqueia; alerta de ±50%', () => {
    expect(energyCharge({ previous: 1000, current: 1200 }, 1, 1.1)).toMatchObject({ kwh: 200, cents: 22000, error: null });
    expect(consumption({ previous: 900, current: 30, reset: { oldFinal: 950, baseline: 0 } })).toBe(80);
    expect(energyCharge({ previous: 900, current: 850 }, 1, 1).error).toMatch(/menor/);
    expect(consumptionAlert(300, [100, 110, 90])).toMatch(/200% acima/);
    expect(consumptionAlert(105, [100, 110, 90])).toBeNull();
    expect(consumptionAlert(300, [100])).toBeNull();
  });

  it('IPTU: cota por área, parcelas de maio a outubro, percentual do parceiro', () => {
    const cfg = { year: 2030, totalCents: 1_200_000, totalAreaM2: 1000, firstMonth: 5, parcels: 6 };
    expect(parcelOf(cfg, '2030-04')).toBeNull();
    expect(parcelOf(cfg, '2030-08')).toBe(4);
    expect(parcelOf(cfg, '2030-11')).toBeNull();
    expect(parcelOf(cfg, '2031-08')).toBeNull();
    expect(iptuParcelCents(cfg, 100)).toBe(20000); // 12.000 × 10% / 6
    expect(iptuParcelCents(cfg, 100, 50)).toBe(10000);
    expect(iptuLabel(4, 6, 50)).toBe('50% IPTU 4 de 6');
    expect(commonArea(cfg, [300, 250.5])).toBe(449.5);
  });

  it('rateio: Lanchonete 30%, resto por alunos, soma exata e percentual real', () => {
    const r = allocate(100_000, [
      { id: 'a', headcount: 1, isSnackBar: false }, { id: 'b', headcount: 2, isSnackBar: false }, { id: 'lanch', headcount: 0, isSnackBar: true },
    ], 30);
    const cents = Object.fromEntries(r.rows.map((x) => [x.id, x.cents]));
    expect(cents).toEqual({ a: 23333, b: 46667, lanch: 30000 });
    expect(r.rows.reduce((s, x) => s + x.cents, 0)).toBe(100_000);
    expect(r.rows.reduce((s, x) => s + x.ratio, 0)).toBeCloseTo(1, 10);
    // Sobra de centavo vai para a Lanchonete.
    const odd = allocate(1000, [{ id: 'a', headcount: 1, isSnackBar: false }, { id: 'b', headcount: 1, isSnackBar: false }, { id: 'c', headcount: 1, isSnackBar: false }, { id: 'l', headcount: 0, isSnackBar: true }], 30);
    expect(odd.rows.map((x) => x.cents)).toEqual([233, 233, 233, 301]);
    expect(allocate(1000, [{ id: 'a', headcount: 0, isSnackBar: false }], 30).error).toMatch(/alunos/);
  });

  const C = (id: string, kind: 'INTERNAL' | 'PARTNER', headcount: number, areaM2: number, extra: Partial<PeriodCenter> = {}): PeriodCenter => ({
    id, name: id, kind, isSnackBar: false, chargesCondo: true, areaM2, iptuSharePct: 100, headcount, billing: 'FULL', activeFrom: '2030-01-01', activeTo: null, ...extra,
  });
  const base = (): PeriodInput => ({
    month: '2030-08', tariff: 1, flagFactor: 1.1, snackBarPct: 30,
    expenses: [{ amountCents: 60_000, confirmed: true, description: 'Água' }, { amountCents: 40_000, confirmed: true, description: 'Limpeza' }],
    centers: [C('Interna', 'INTERNAL', 2, 400), C('Lanch', 'INTERNAL', 0, 100, { isSnackBar: true }), C('Parceiro', 'PARTNER', 1, 100), C('Meia', 'PARTNER', 0, 200, { iptuSharePct: 50, chargesCondo: false })],
    meters: [{ id: 'm1', centerId: 'Parceiro', name: 'Relógio P', previous: 100, current: 300, estimated: false, reset: null, history: [] }],
    iptu: { year: 2030, totalCents: 600_000, totalAreaM2: 1000, firstMonth: 5, parcels: 6 },
    items: [
      { id: 'i1', centerId: 'Parceiro', description: 'Aluguel da Sala', qty: null, unitCents: null, amountCents: 10_000, adhoc: false },
      { id: 'i2', centerId: 'Parceiro', description: 'Check In', qty: 4, unitCents: 2500, amountCents: 0, adhoc: false },
      { id: 'i3', centerId: 'Parceiro', description: 'Desconto', qty: null, unitCents: null, amountCents: -500, adhoc: true },
    ],
  });

  it('competência: despesas → rateio → cobrança com energia, condomínio, IPTU, itens e avulsos', () => {
    const r = computePeriod(base());
    expect(r.totalCents).toBe(100_000);
    expect(r.issues).toEqual([]);
    const p = r.charges.find((c) => c.centerId === 'Parceiro')!;
    expect(p.lines.map((l) => [l.kind, l.description, l.cents])).toEqual([
      ['ENERGIA', 'Energia', 22000], // 200 kWh × 1 × 1,1
      ['CONDOMINIO', 'Condomínio', 23333], // 70.000 / 3 alunos
      ['IPTU', 'IPTU 4 de 6', 10000], // 6.000 × 10% / 6
      ['ITEM', 'Aluguel da Sala', 10000],
      ['ITEM', 'Check In (4)', 10000],
      ['AVULSO', 'Desconto', -500],
    ]);
    expect(p.totalCents).toBe(74833);
    expect(p.lines[0]!.detail).toBe('100 → 300 = 200 kWh × R$ 1 × 1,1');
    // Fora do rateio, paga só a metade do IPTU da área dele.
    expect(r.charges.find((c) => c.centerId === 'Meia')!.lines).toEqual([{ kind: 'IPTU', description: '50% IPTU 4 de 6', cents: 10000 }]);
    // Centro interno não recebe cobrança.
    expect(r.charges.map((c) => c.centerId)).toEqual(['Parceiro', 'Meia']);
  });

  it('competência: variável a confirmar e leitura faltando bloqueiam; fora de maio–outubro não há IPTU', () => {
    const p = base();
    p.expenses[1]!.confirmed = false;
    p.meters[0]!.current = null;
    p.month = '2030-11';
    const r = computePeriod(p);
    expect(r.issues.join(' ')).toMatch(/a confirmar: Limpeza/);
    expect(r.issues.join(' ')).toMatch(/Falta a leitura do relógio "Relógio P"/);
    expect(r.charges[0]!.lines.some((l) => l.kind === 'IPTU')).toBe(false);
  });

  it('entrada no meio do mês: proporcional aos dias (energia e avulsos inteiros); "não cobrar" tira a cobrança', () => {
    expect(activeDays('2030-08', '2030-08-17', null)).toBe(15);
    expect(activeDays('2030-08', '2030-01-01', '2030-08-10')).toBe(10);
    expect(activeDays('2030-08', '2030-09-01', null)).toBe(0);
    const p = base();
    p.centers[2] = { ...p.centers[2]!, activeFrom: '2030-08-17', billing: 'PRORATA' };
    const r = computePeriod(p);
    const c = r.charges.find((x) => x.centerId === 'Parceiro')!;
    expect(c.prorata).toEqual({ days: 15, of: 31 });
    expect(c.lines.find((l) => l.kind === 'ENERGIA')!.cents).toBe(22000);
    expect(c.lines.find((l) => l.kind === 'CONDOMINIO')!.cents).toBe(Math.round(23333 * 15 / 31));
    expect(c.lines.find((l) => l.kind === 'AVULSO')!.cents).toBe(-500);
    p.centers[2]!.billing = 'NONE';
    expect(computePeriod(p).charges.map((x) => x.centerId)).toEqual(['Meia']);
  });
});

describe('PIX copia e cola', () => {
  it('CRC16-CCITT e payload EMV com chave, valor, favorecido e txid', async () => {
    const { crc16, normalizePixKey, pixPayload } = await import('@/domain/condominio/pix');
    expect(crc16('123456789')).toBe('29B1'); // vetor de teste do CRC-16/CCITT-FALSE
    expect(normalizePixKey('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizePixKey('(61) 99999-0000')).toBe('+5561999990000');
    expect(normalizePixKey('Financeiro@Nacao.com')).toBe('financeiro@nacao.com');
    const p = pixPayload({ key: '12.345.678/0001-90', name: 'Nação Club Recreações Esportivas Ltda', city: 'Brasília', amountCents: 213675, txid: 'CONDO-2030-08-N12' });
    expect(p.startsWith('000201')).toBe(true);
    expect(p).toContain('0014br.gov.bcb.pix011412345678000190');
    expect(p).toContain('54072136.75');
    expect(p).toContain('5925NACAO CLUB RECREACOES ESP6008');
    expect(p).toContain('6008BRASILIA');
    expect(p).toContain('62180514CONDO203008N12');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });
});

describe('importação da planilha (layout ENERGIA / IPTU / aba do mês)', () => {
  it('lê despesas por grupo, rateio, cobranças (inclusive IPTU escondido no total), relógios e IPTU', async () => {
    const { parseCondoWorkbook, importCheck, memoOf, monthOfTab } = await import('@/domain/condominio/import');
    type V = number | string | Date | null;
    const sheet = (name: string, cells: Record<string, V | [V, string]>) => ({
      name, rows: 60,
      cell(r: number, c: number) {
        const v = cells[`${String.fromCharCode(64 + c)}${r}`];
        return Array.isArray(v) ? { value: v[0], formula: v[1] } : { value: v ?? null, formula: null };
      },
    });
    const d = (m: number) => new Date(Date.UTC(2090, m - 1, 1));
    const energia = sheet('ENERGIA', { A1: 'Mês Ref', B1: 'PARCEIRO X', A2: d(7), B2: 1000, A3: d(8), B3: [1200, '=B2+200'] });
    const iptu = sheet('IPTU', { B2: 'IPTU 2090', C2: 600000 / 100, F2: 1000, E5: 'Interna', B5: 400, E6: 'Parceiro X', B6: 100, E7: 'Lanchonete', B7: 100, E8: 'Área Comum', B8: 400 });
    const mes = (name: string, extra: Record<string, V | [V, string]>) => sheet(name, {
      A3: 'DESPESAS GERAIS', A4: 'Água', B4: 600, A5: 'SEGURANÇA', A6: 'Salários', B6: [400, '=(100+300)'], A7: 'INSS', B7: 0, A8: 'TOTAL', B8: 1000,
      D3: 'Interna', F3: 2, G3: 466.67, D4: 'Parceiro X', F4: 1, G4: 233.33, D5: 'Lanchonete', F5: 0, G5: 300, D6: 'Total - Bar', ...extra,
    });
    const b = parseCondoWorkbook([energia, iptu,
      mes('Julho 90', { J3: 'Parceiro X Ltda', K3: 'Energia', L3: 100, M3: [433.33, '=SUM(L3:L4)+IPTU!F6'], K4: 'Condomínio', L4: 233.33 }),
      mes('Agosto 90', { J3: 'Parceiro X Ltda', K3: 'Energia', L3: 220, M3: [503.33, '=SUM(L3:L5)'], K4: 'Condomínio', L4: 233.33, K5: 'Check In (2)', L5: [50, '=25*(2)'], J8: 'ALUGUEL PARCEIROS ' }),
    ]);
    expect(monthOfTab('Agosto 26')).toBe('2026-08');
    expect(monthOfTab('Jan 2024')).toBeNull();
    expect(memoOf('=(1200+800+99.5)')).toBe('1.200 + 800 + 99,5');
    expect(memoOf('=B2+200')).toBeNull();
    expect(b.periods.map((p) => p.month)).toEqual(['2090-07', '2090-08']);
    const ago = b.periods[1]!;
    expect(ago.expenses.map((e) => [e.group, e.description, e.amountCents, e.kind])).toEqual([
      ['DESPESAS GERAIS', 'Água', 60000, 'VARIABLE'], ['SEGURANÇA', 'Salários', 40000, 'FIXED'], ['SEGURANÇA', 'INSS', 0, 'FIXED'],
    ]);
    expect(ago.expenses[1]!.memo).toBe('100 + 300');
    expect(ago.headcounts).toEqual({ interna: 2, 'parceiro-x': 1, lanchonete: 0 });
    expect(ago.snackBarPct).toBe(30);
    expect(ago.items).toEqual([{ centerKey: 'parceiro-x', description: 'Check In', amountCents: 0, unitCents: 2500, qty: 2 }]);
    // Julho: o IPTU estava só na fórmula do total → vira linha "IPTU".
    expect(b.periods[0]!.charges[0]!.lines.at(-1)).toEqual({ kind: 'IPTU', description: 'IPTU', cents: 10000 });
    const parceiro = b.centers.find((c) => c.key === 'parceiro-x')!;
    expect(parceiro).toMatchObject({ kind: 'PARTNER', displayName: 'Parceiro X Ltda', areaM2: 100 });
    expect(b.centers.find((c) => c.key === 'lanchonete')!.isSnackBar).toBe(true);
    expect(b.meters[0]!.readings).toEqual([{ month: '2090-07', reading: 1000, estimated: false }, { month: '2090-08', reading: 1200, estimated: true }]);
    expect(b.iptu).toEqual({ year: 2090, totalCents: 600000, totalAreaM2: 1000, firstMonth: 5, parcels: 6 });
    // Conferência do último mês: energia 200 kWh × 1 × 1,1 + condomínio + check-in + IPTU 4 de 6 (100) — o motor recalcula.
    const check = importCheck(b, '2090-08', 1, 1.1);
    expect(check[0]).toMatchObject({ billedCents: 50333, computedCents: 22000 + 23333 + 5000 + 10000 });
  });
});
