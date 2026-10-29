import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { confirmDay, deleteOverride, generateSchedule, holidayBoard, loadDocumentModels, loadMonth, saveHolidayRule, saveOverride, setRotation } from '@/server/services/ws-service';
import { cyclePhase } from '@/domain/escalas/calendar';
import { holidaysOf } from '@/domain/holidays';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

const H = (h: number, m = 0) => h * 60 + m;

/** Modelos do documento "Escala de Trabalho 5x2 — Nação Club": carregam e geram a grade do documento. */
describe.skipIf(!hasDb)('Modelos iniciais das escalas', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  const sector = async (name: string) => (await prisma.wsSector.findFirstOrThrow({ where: { name } })).id;
  const view = async (name: string) => loadMonth(admin.principal, await sector(name), 2026, 11);
  const memberId = (v: Awaited<ReturnType<typeof view>>, name: string) => v.members.find((m) => m.name === name)!.id;

  const created: string[] = [];
  // Os feriados criados aqui saem no fim (outros testes usam o mesmo banco).
  afterAll(async () => { await prisma.holiday.deleteMany({ where: { id: { in: created } } }); });

  beforeAll(async () => {
    await ensureCatalog();
    admin = await makeUser('ADMIN');
    await prisma.wsLegalParam.deleteMany({ where: { bond: 'CLT' } });
    for (const h of holidaysOf(2026)) {
      const date = new Date(`${h.date}T00:00:00Z`);
      if (await prisma.holiday.findUnique({ where: { date } })) continue;
      created.push((await prisma.holiday.create({ data: { date, name: h.name, scope: h.scope } })).id);
    }
    const r = await loadDocumentModels(admin.principal, META);
    expect(r.created.sort()).toEqual(['Cozinha', 'Lanchonete', 'Limpeza e Manutenção', 'Recepção'].filter((n) => !r.skipped.includes(n)).sort());
    for (const n of ['Recepção', 'Limpeza e Manutenção', 'Lanchonete', 'Cozinha']) await generateSchedule(admin.principal, await sector(n), 2026, 11, META);
  });

  it('é idempotente e cria os parâmetros CLT de 40h sem validar', async () => {
    expect((await loadDocumentModels(admin.principal, META)).created).toEqual([]);
    const clt = await prisma.wsLegalParam.findFirstOrThrow({ where: { bond: 'CLT' } });
    expect(clt.maxWeeklyMin).toBe(2400);
    expect(clt.validatedAt).toBeNull();
  });

  it('Recepção: rodízio das folgas — folga quinta ⇒ domingo; folga sexta ⇒ sábado; qui+sex ⇒ folga no fim de semana; horário de seg–sex sempre o fixo', async () => {
    const v = await view('Recepção');
    const people = ['Duda', 'Lawana', 'Brenda', 'Manu', 'Débora', 'Igor'].map((n) => memberId(v, n));
    const k = (id: string, d: string) => v.grid[id]![d]!.kind;
    const fixedTue = new Map(people.map((id) => [id, v.members.find((m) => m.id === id)!.hours.week!.cycle![0]![1]![0]]));
    const feriado = new Set(v.days.filter((d) => d.holiday && d.holiday.scope !== 'FACULTATIVO').map((d) => d.date));
    // Semanas inteiras do mês sem feriado em dia útil (no feriado só uma pessoa trabalha).
    for (const w of v.month.weeks.filter((x) => x.days.every((d) => d >= v.month.first && d <= v.month.last && !feriado.has(d)))) {
      const [, , , qui, sex, sab, dom] = w.days as [string, string, string, string, string, string, string];
      for (const id of people) {
        if (k(id, qui) === 'FOLGA') { expect(k(id, dom)).toBe('TRABALHO'); expect(k(id, sex)).toBe('TRABALHO'); }
        if (k(id, sex) === 'FOLGA') expect(k(id, sab)).toBe('TRABALHO');
        if (k(id, qui) === 'TRABALHO' && k(id, sex) === 'TRABALHO' && k(id, dom) !== 'TRABALHO') expect(k(id, sab)).toBe('FOLGA');
      }
      // Toda semana: 1 no domingo, 2 no sábado, 5 na quinta, 4 na sexta (cobertura do documento).
      expect(people.filter((id) => k(id, dom) === 'TRABALHO').length).toBe(1);
      expect(people.filter((id) => k(id, sab) === 'TRABALHO').length).toBe(2);
      expect(people.filter((id) => k(id, qui) === 'TRABALHO').length).toBe(5);
      expect(people.filter((id) => k(id, sex) === 'TRABALHO').length).toBe(4);
      // Cada pessoa: 5 dias e 2 folgas por semana.
      for (const id of people) expect(w.days.filter((d) => k(id, d) === 'TRABALHO').length).toBe(5);
      // Segunda a quarta (todos trabalham): cada um no próprio horário fixo, igual em todas as semanas.
      for (const id of people) expect(v.grid[id]![w.days[1]!]!.startMin).toBe(fixedTue.get(id));
    }
    // Domingo gira: pessoas diferentes em domingos seguidos; ninguém mais em todos.
    const sundays = v.month.days.filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0);
    const who = sundays.map((d) => people.find((id) => k(id, d) === 'TRABALHO'));
    expect(new Set(who).size).toBe(who.length);
    // Horário não muda para cobrir furo: quando quem abre às 05h está de folga, o posto fica sinalizado (ajuste manual).
    expect(v.analysis!.alerts.filter((a) => a.level === 'CONFLITO').every((a) => a.code === 'DESCOBERTO' && /Abertura \(05:00/.test(a.message))).toBe(true);
  });

  it('Recepção no feriado: horário próprio 07–14, uma pessoa, em rodízio (cada feriado com uma pessoa diferente) e sempre para confirmar', async () => {
    const v = await view('Recepção');
    const people = ['Duda', 'Lawana', 'Brenda', 'Manu', 'Débora', 'Igor'].map((n) => memberId(v, n));
    const who: string[] = [];
    for (const d of ['2026-11-02', '2026-11-20', '2026-11-30']) {
      const on = people.filter((id) => v.grid[id]![d]!.kind === 'TRABALHO');
      expect(on.length).toBe(1);
      const c = v.grid[on[0]!]![d]!;
      expect([c.startMin, c.endMin, c.breakMin]).toEqual([H(7), H(14), 60]);
      expect(c.note).toMatch(/rodízio/);
      // Os demais folgam (no feriado ou já na folga da grade daquele dia).
      expect(people.filter((id) => id !== on[0]).every((id) => v.grid[id]![d]!.kind === 'FOLGA' && /^(Feriado|Folga da grade)/.test(v.grid[id]![d]!.note ?? ''))).toBe(true);
      expect(v.analysis!.alerts.some((a) => a.code === 'CALENDARIO' && a.date === d && /Confirme/.test(a.message))).toBe(true);
      who.push(on[0]!);
    }
    expect(new Set(who).size).toBe(3);
    // Confirmar tira o aviso daquele feriado.
    await confirmDay(admin.principal, await sector('Recepção'), '2026-11-02', META);
    const after = await view('Recepção');
    expect(after.analysis!.alerts.some((a) => a.code === 'CALENDARIO' && a.date === '2026-11-02')).toBe(false);
    expect(after.analysis!.alerts.some((a) => a.code === 'CALENDARIO' && a.date === '2026-11-20')).toBe(true);
  });

  it('dezembro: rodízio de feriados lembra novembro e o banco traz o saldo anterior', async () => {
    const sid = await sector('Recepção');
    await generateSchedule(admin.principal, sid, 2026, 12, META);
    const nov = await view('Recepção');
    const dec = await loadMonth(admin.principal, sid, 2026, 12);
    const xmas = dec.members.find((m) => dec.grid[m.id]!['2026-12-25']!.kind === 'TRABALHO')!;
    const novWorkers = new Set(['2026-11-02', '2026-11-20', '2026-11-30'].map((d) => nov.members.find((m) => nov.grid[m.id]![d]!.kind === 'TRABALHO')!.id));
    expect(novWorkers.has(xmas.id)).toBe(false);
    const st = dec.analysis!.members.find((m) => m.memberId === xmas.id)!;
    const novSt = nov.analysis!.members.find((m) => m.memberId === xmas.id)!;
    expect(st.carryMin).toBe(novSt.balanceMin);
  });

  it('Lanchonete, Cozinha e Limpeza no feriado: como sábado (horário de sábado do setor), para confirmar', async () => {
    for (const n of ['Lanchonete', 'Cozinha', 'Limpeza e Manutenção']) {
      const v = await view(n);
      const sabado = v.days.find((d) => d.date === '2026-11-07')!.open;
      expect(v.days.find((d) => d.date === '2026-11-02')!.open).toEqual(sabado);
      expect(v.analysis!.alerts.some((a) => a.code === 'CALENDARIO' && a.date === '2026-11-02' && /como sábado/.test(a.message))).toBe(true);
      if (n === 'Limpeza e Manutenção') continue;
      const sab = '2026-11-07'; // sábado da mesma semana
      const seg = '2026-11-09'; // segunda seguinte
      for (const m of v.members.filter((x) => x.mode === 'FIXO' && x.autoSchedule)) {
        // FUNAP trabalha o feriado como dia normal (segunda); os demais seguem o sábado.
        const ref = m.bond === 'FUNAP' ? seg : sab;
        expect(v.grid[m.id]!['2026-11-02']!.kind === 'TRABALHO').toBe(v.grid[m.id]![ref]!.kind === 'TRABALHO');
      }
      expect(v.analysis!.uncovered).toEqual([]);
    }
    // Domingo-feriado (15/11) segue a equipe normal de domingo.
    const k = await view('Cozinha');
    expect(k.grid[memberId(k, 'Caliane')]!['2026-11-15']!.kind).toBe('TRABALHO');
  });

  it('Montar rodízio: desfazer e montar de novo reproduz as posições', async () => {
    const sid = await sector('Recepção');
    const before = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    await setRotation(admin.principal, sid, [], META);
    const flat = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    expect(flat.every((m) => !(m.hours as { week?: { cycle?: unknown } }).week?.cycle)).toBe(true);
    await setRotation(admin.principal, sid, flat.map((m) => m.id), META);
    const after = await prisma.wsMember.findMany({ where: { sectorId: sid }, orderBy: { sortOrder: 'asc' } });
    expect(after.map((m) => m.hours)).toEqual(before.map((m) => m.hours));
    await expect(setRotation(admin.principal, sid, [flat[0]!.id], META)).rejects.toThrow(/2 pessoas/);
  });

  it('Limpeza: Marcos todo sábado; Junior × Carlos e Lu × Kelly alternam; John fora da geração', async () => {
    const v = await view('Limpeza e Manutenção');
    for (const d of ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']) {
      expect(v.grid[memberId(v, 'Marcos')]![d]!.kind).toBe('TRABALHO');
      const a = cyclePhase(d, '2026-11-02') === 'A';
      expect(v.grid[memberId(v, 'Carlos')]![d]!.kind).toBe(a ? 'TRABALHO' : 'FOLGA');
      expect(v.grid[memberId(v, 'Junior')]![d]!.kind).toBe(a ? 'FOLGA' : 'TRABALHO');
      expect(v.grid[memberId(v, 'Lu')]![d]!.kind).toBe(a ? 'TRABALHO' : 'FOLGA');
    }
    expect(v.grid[memberId(v, 'John')]!['2026-11-03']!.kind).toBe('SEM_GRADE');
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    expect(v.analysis!.alerts.some((x) => x.code === 'LEGAL_PENDENTE' && /FUNAP/.test(x.message))).toBe(true);
  });

  it('Lanchonete: Jess e Débora alternam terça/quarta e o Caio abre quando a Jess folga', async () => {
    const v = await view('Lanchonete');
    const jess = v.grid[memberId(v, 'Jess')]!;
    const caio = v.grid[memberId(v, 'Caio')]!;
    expect(jess['2026-11-03']!.kind).toBe('FOLGA'); // terça, semana A
    expect(caio['2026-11-03']!.startMin).toBe(H(7));
    expect(jess['2026-11-11']!.kind).toBe('FOLGA'); // quarta, semana B
    expect(caio['2026-11-11']!.startMin).toBe(H(7));
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    expect(v.analysis!.uncovered).toEqual([]);
  });

  it('Cozinha: 4 CLT por dia útil, equipes alternando o fim de semana e Edilene no almoço de terça', async () => {
    const v = await view('Cozinha');
    const clt = ['Fia', 'Caliane', 'Tati', 'Renata', 'Tati Amorim'].map((n) => memberId(v, n));
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']) {
      expect(clt.filter((id) => v.grid[id]![d]!.kind === 'TRABALHO').length).toBe(4);
    }
    expect(v.grid[memberId(v, 'Caliane')]!['2026-11-07']!.kind).toBe('TRABALHO'); // sábado A
    expect(v.grid[memberId(v, 'Renata')]!['2026-11-08']!.kind).toBe('TRABALHO'); // domingo A
    expect(v.grid[memberId(v, 'Renata')]!['2026-11-14']!.kind).toBe('TRABALHO'); // sábado B
    expect(v.grid[memberId(v, 'Caliane')]!['2026-11-15']!.kind).toBe('TRABALHO'); // domingo B (feriado)
    expect(v.grid[memberId(v, 'Edilene')]!['2026-11-10']!.note).toMatch(/almoço/i);
    expect(v.analysis!.alerts.filter((x) => x.code === 'REGRA')).toEqual([]);
    const fia = v.analysis!.members.find((m) => m.name === 'Fia')!;
    expect(fia.days).toBeGreaterThanOrEqual(20);
  });

  it('tela Feriados: regra do setor, ajuste de um feriado (Nação fecha às 14h) e confirmação', async () => {
    const lanch = await sector('Lanchonete');
    let b = await holidayBoard(admin.principal, '2026-11-01');
    const nov15 = () => b.holidays.find((h) => h.date === '2026-11-15')!.sectors.find((x) => x.sectorId === lanch)!;
    expect(b.sectors.find((x) => x.id === lanch)!.mode).toBe('SABADO');
    // 15/11/2026 é domingo: feriado no fim de semana fica com o horário do próprio dia (domingo 08–17).
    expect(nov15()).toMatchObject({ open: [[H(8), H(17)]], needsConfirm: true });
    const adj = await saveOverride(admin.principal, null, { date: '2026-11-15', sectorId: null, hours: [[H(8), H(14)]], reason: 'Nação fecha às 14h' }, META);
    b = await holidayBoard(admin.principal, '2026-11-01');
    expect(nov15()).toMatchObject({ open: [[H(8), H(14)]], adjusted: true });
    await confirmDay(admin.principal, lanch, '2026-11-15', META);
    b = await holidayBoard(admin.principal, '2026-11-01');
    expect(nov15()).toMatchObject({ confirmed: true, needsConfirm: false });
    await deleteOverride(admin.principal, nov15().confirmationId!, META);
    await deleteOverride(admin.principal, adj, META);
    // Horário próprio exige horário; fechado fecha todos os feriados do setor.
    await expect(saveHolidayRule(admin.principal, lanch, { mode: 'PROPRIO' }, META)).rejects.toThrow(/horário/);
    await saveHolidayRule(admin.principal, lanch, { mode: 'FECHADO', confirm: false }, META);
    b = await holidayBoard(admin.principal, '2026-11-01');
    expect(nov15()).toMatchObject({ open: [], needsConfirm: false });
    await saveHolidayRule(admin.principal, lanch, { mode: 'SABADO', rotate: true, confirm: true }, META);
  });

  it('férias da Brenda (02 a 16/11): só troca folgas na semana — não muda o horário de ninguém', async () => {
    const sid = await sector('Recepção');
    const before = await view('Recepção');
    const brenda = before.members.find((m) => m.name === 'Brenda')!;
    const leave = await prisma.leave.create({ data: { teacherId: brenda.teacherId, type: 'FERIAS', coverage: 'PENDENTE', startDate: new Date('2026-11-02T00:00:00Z'), endDate: new Date('2026-11-16T00:00:00Z') } });
    try {
      await generateSchedule(admin.principal, sid, 2026, 11, META);
      const v = await view('Recepção');
      expect(v.grid[brenda.id]!['2026-11-10']!.kind).toBe('FERIAS');
      // Quem já trabalhava no dia continua no mesmo horário de antes das férias.
      for (const m of v.members.filter((x) => x.id !== brenda.id)) {
        for (const d of v.month.days) {
          const c = v.grid[m.id]![d]!; const o = before.grid[m.id]![d]!;
          if (c.kind === 'TRABALHO' && o.kind === 'TRABALHO') expect([d, m.name, c.startMin, c.endMin]).toEqual([d, m.name, o.startMin, o.endMin]);
        }
      }
      // Quem sai da folga para cobrir faz o turno que seria da Brenda.
      const swapped = v.members.flatMap((m) => v.month.days.filter((d) => /^Troca de folga/.test(v.grid[m.id]![d]!.note ?? '')).map((d) => ({ d, c: v.grid[m.id]![d]! })));
      expect(swapped.length).toBeGreaterThan(0);
      for (const { d, c } of swapped) expect([c.startMin, c.endMin]).toEqual([before.grid[brenda.id]![d]!.startMin, before.grid[brenda.id]![d]!.endMin]);
      // Ninguém passa de 5 dias nas semanas inteiras do mês.
      for (const w of v.month.weeks.filter((x) => x.days.every((d) => d >= v.month.first && d <= v.month.last))) {
        for (const m of v.members.filter((x) => x.id !== brenda.id)) expect(w.days.filter((d) => v.grid[m.id]![d]!.kind === 'TRABALHO').length).toBeLessThanOrEqual(5);
      }
      expect(v.analysis!.alerts.filter((a) => a.level === 'CONFLITO' && a.code !== 'AUSENTE_ESCALADO' && a.code !== 'DESCOBERTO')).toEqual([]);
    } finally {
      await prisma.leave.delete({ where: { id: leave.id } });
      await generateSchedule(admin.principal, sid, 2026, 11, META);
    }
  });
});
