import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { audit } from '@/server/audit';
import { addDays, toUtc, fromUtc, type IsoDate } from '@/domain/dates';
import { isBlockedStatus, isCollectible, isoFromApi, money, pickMobile, type DebtIn } from '@/domain/cobranca';
import { tecnofitApi, type TecnofitApi, type TfCustomerSale, type TfPerson } from '@/server/tecnofit/client';
import { generateTasks } from './crm-task-service';

/**
 * Sincronização diária com a Tecnofit (só leitura) → débitos e casos de cobrança.
 *
 * 1) Preparo (poucas chamadas): consultores, ligações do CRM (consultor de cada aluno),
 *    vendas NÃO recebidas dos últimos 12 meses (em janelas de 90 dias) e alunos
 *    bloqueados/restritos. Candidatos = esses + quem já tem débito/caso aberto aqui.
 * 2) Alunos (1–2 chamadas cada): vendas do aluno (valor em aberto + vencimento) e,
 *    se preciso, contatos (celular). Atualiza débitos e abre/resolve casos.
 *
 * Retomável: os alunos que faltam ficam em `tec_sync_runs.pending`; cada chamada
 * processa até o orçamento de tempo e a seguinte continua de onde parou.
 */

const SALES_LOOKBACK_DAYS = 360;
const CALLS_LOOKBACK_DAYS = 90;
/** Retornos agendados (promessas) até 60 dias à frente. */
const CALLS_AHEAD_DAYS = 60;
const CONTACTS_REFRESH_DAYS = 7;
/** LGPD: aluno sem débito nem caso há mais de 90 dias sai do espelho. */
const RETENTION_DAYS = 90;
const SAVE_EVERY = 10;

interface Pending { id: string; name: string; status: string | null; consultant: string | null; lastCallDone?: string | null; nextCall?: string | null }
interface Stats { candidates?: number; processed?: number; casesOpened?: number; casesResolved?: number; debtsPaid?: number; consultants?: number; purged?: number; warning?: string; tasksCreated?: number; tasksDone?: number; salesRead?: number; salesWithSeller?: number; salesShape?: string; errors?: { customer: string; error: string }[] }

const SYSTEM = { actorId: null, userAgent: 'sincronizacao-tecnofit' };
const d = (iso: IsoDate) => toUtc(iso);
const iso = (v: Date | null) => (v ? fromUtc(v) : null);
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export interface SyncResult { runId: string; status: string; processed: number; remaining: number; stats: Stats }

/** Converte as vendas do aluno em débitos cobráveis (com valor em aberto e vencimento até D+3). */
export function collectibleDebts(sales: TfCustomerSale[], today: IsoDate): DebtIn[] {
  return sales
    .map((s) => ({
      saleId: String(s.id),
      dueDate: isoFromApi(s.dueDate),
      openValue: money(s.openValue),
      totalValue: money(s.totalValue),
      description: (s.items ?? []).map((i) => i?.name).filter(Boolean).join(', ').slice(0, 200) || 'Venda',
    }))
    .filter((x) => x.saleId && isCollectible(x, today));
}

async function prepare(api: TecnofitApi, today: IsoDate): Promise<{ pending: Pending[]; consultants: number; warning: string | null }> {
  // Consultores
  const consultants = await api.consultants();
  for (const c of consultants) {
    await prisma.crmConsultant.upsert({ where: { tecnofitId: c.id }, create: { tecnofitId: c.id, name: c.name }, update: { name: c.name, active: true } });
  }

  // Consultor de cada aluno = o da ligação de CRM mais recente.
  // e, por aluno, a última ligação CONCLUÍDA e o retorno PENDENTE mais próximo (promessa/retorno agendado).
  const consultantOf = new Map<string, string>();
  const lastDone = new Map<string, string>();
  const pendingCalls = new Map<string, string[]>();
  // Ligações são complemento: se a Tecnofit recusar, a sincronização segue (sem consultor/baixa por ligação) e avisa.
  let warning: string | null = null;
  const calls = (await api.calls(addDays(today, -CALLS_LOOKBACK_DAYS), addDays(today, CALLS_AHEAD_DAYS)).catch((e: unknown) => {
    warning = `Ligações do CRM indisponíveis hoje: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    return [];
  })).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  for (const c of calls) {
    if (c.consultantId && (!c.at || c.at.slice(0, 10) <= today)) consultantOf.set(c.customerId, c.consultantId);
    const doneDay = c.done ? isoFromApi(c.doneAt ?? c.at) : null;
    if (doneDay && doneDay <= today && doneDay > (lastDone.get(c.customerId) ?? '')) lastDone.set(c.customerId, doneDay);
    const due = !c.done ? isoFromApi(c.deadline) : null;
    if (due) pendingCalls.set(c.customerId, [...(pendingCalls.get(c.customerId) ?? []), due]);
  }
  // Diagnóstico: ligações vazias ou sem consultor deixavam todo mundo "sem responsável" sem ninguém saber.
  const cd = api.diag?.calls;
  if (!warning && cd) {
    if (cd.raw === 0) warning = 'A Tecnofit não devolveu nenhuma ligação do CRM no período: o responsável vem do consultor da venda em aberto.';
    else if (cd.withConsultant === 0) warning = `Ligações do CRM vieram sem consultor (${cd.raw} lidas; campos: ${cd.shape.slice(0, 220)}). O responsável vem do consultor da venda em aberto.`;
  }

  /** Retorno pendente mais próximo, ignorando os agendados antes da última ligação concluída (ficaram velhos). */
  const nextCallOf = (id: string) => (pendingCalls.get(id) ?? []).filter((x) => x > (lastDone.get(id) ?? '')).sort()[0] ?? null;

  const byId = new Map<string, Pending>();
  const add = (id: string, name: string, status: string | null) => {
    const cur = byId.get(id);
    byId.set(id, { id, name: name || cur?.name || '', status: status ?? cur?.status ?? null, consultant: consultantOf.get(id) ?? null, lastCallDone: lastDone.get(id) ?? null, nextCall: nextCallOf(id) });
  };

  for (let end = today; end > addDays(today, -SALES_LOOKBACK_DAYS); end = addDays(end, -90)) {
    const start = addDays(end, -89);
    for (const s of await api.unreceivedSales(start, end)) add(s.customer.id, s.customer.name, null);
  }
  for (const st of ['blocked', 'restricted'] as const) for (const c of await api.customersByStatus(st)) add(c.id, c.name, st);

  // Quem já tem débito ou caso aberto aqui é sempre reconferido (pode ter pago).
  const known = await prisma.tecCustomer.findMany({
    where: { OR: [{ debts: { some: { status: 'ABERTO' } } }, { cases: { some: { status: 'ABERTO' } } }, { tasks: { some: { status: 'ABERTA' } } }] },
    select: { tecnofitId: true, name: true },
  });
  for (const k of known) if (!byId.has(k.tecnofitId)) add(k.tecnofitId, k.name, null);

  return { pending: [...byId.values()], consultants: consultants.length, warning };
}

/** Vendedor da venda em aberto mais recente (entre as que geraram débito). */
function sellerOfOpenSale(sales: TfCustomerSale[], openSaleIds: string[]): TfPerson | null {
  const open = new Set(openSaleIds);
  const withSeller = sales.filter((s) => s.seller && (open.size === 0 || open.has(s.id)));
  withSeller.sort((a, b) => String(b.saleDate ?? '').localeCompare(String(a.saleDate ?? '')));
  return withSeller[0]?.seller ?? null;
}

async function ownerFor(consultantTecId: string | null): Promise<string | null> {
  if (!consultantTecId) return null;
  const c = await prisma.crmConsultant.findUnique({ where: { tecnofitId: consultantTecId } });
  return c?.active && c.userId ? c.userId : null;
}

/**
 * Valores do caso a partir dos débitos que estiveram abertos desde a abertura:
 * original = soma do valor em aberto quando cada débito apareceu; aberto = soma atual;
 * recuperado = débitos quitados + abatimentos parciais dos que seguem abertos.
 */
async function caseValues(tx: Prisma.TransactionClient, customerId: string, openedOn: IsoDate) {
  const debts = await tx.tecDebt.findMany({ where: { customerId, status: { in: ['ABERTO', 'QUITADO'] }, lastSeenOn: { gte: d(openedOn) } } });
  let original = 0, open = 0, recovered = 0;
  for (const x of debts) {
    original += num(x.firstOpenValue);
    if (x.status === 'ABERTO') { open += num(x.openValue); recovered += Math.max(num(x.firstOpenValue) - num(x.openValue), 0); }
    else recovered += num(x.firstOpenValue);
  }
  return { originalValue: dec(original), openValue: dec(open), recoveredValue: dec(recovered) };
}

/** Processa um aluno: débitos, celular e casos. Devolve o que mudou (para as contagens). */
async function processCustomer(api: TecnofitApi, p: Pending, today: IsoDate): Promise<{ opened: number; resolved: number; paid: number }> {
  const sales = await api.customerSales(p.id, addDays(today, -(SALES_LOOKBACK_DAYS + 60)));
  const debts = collectibleDebts(sales, today);
  const existing = await prisma.tecCustomer.findUnique({ where: { tecnofitId: p.id } });

  let mobile = existing?.mobile ?? null;
  const checked = iso(existing?.contactsCheckedOn ?? null);
  const needContacts = (debts.length > 0 || isBlockedStatus(p.status)) && (!mobile || !checked || checked < addDays(today, -CONTACTS_REFRESH_DAYS));
  let contactsCheckedOn = existing?.contactsCheckedOn ?? null;
  if (needContacts) {
    mobile = pickMobile(await api.customerContacts(p.id));
    contactsCheckedOn = d(today);
  }

  // Responsável (decisão 13/11): consultor da ligação mais recente; sem ligação, o da venda em aberto mais recente.
  const seller = sellerOfOpenSale(sales, debts.map((x) => x.saleId));
  if (seller) await prisma.crmConsultant.upsert({ where: { tecnofitId: seller.id }, create: { tecnofitId: seller.id, name: seller.name || `Funcionário Tecnofit ${seller.id}` }, update: {} });
  const consultantTec = p.consultant ?? seller?.id ?? existing?.consultantTecId ?? null;
  const owner = await ownerFor(consultantTec);
  // Ligações: mantém a última concluída conhecida (a janela de 90 dias pode não alcançá-la mais).
  const prevDone = iso(existing?.lastCallDoneOn ?? null);
  const doneDay = [p.lastCallDone ?? null, prevDone].filter((x): x is string => !!x).sort().at(-1) ?? null;
  const calls = { lastDone: doneDay ? d(doneDay) : null, next: p.nextCall ? d(p.nextCall) : null };
  let opened = 0, resolved = 0, paid = 0;

  await prisma.$transaction(async (tx) => {
    const cust = await tx.tecCustomer.upsert({
      where: { tecnofitId: p.id },
      create: { tecnofitId: p.id, name: p.name || 'Aluno sem nome', status: p.status, mobile, consultantTecId: consultantTec, contactsCheckedOn, lastCallDoneOn: calls.lastDone, nextCallOn: calls.next, lastSeenOn: d(today) },
      update: { name: p.name || undefined, status: p.status, mobile, consultantTecId: consultantTec ?? undefined, contactsCheckedOn, lastCallDoneOn: calls.lastDone, nextCallOn: calls.next, lastSeenOn: d(today) },
    });

    // Débitos: atualiza os que seguem em aberto; os que sumiram viram QUITADO.
    const seen = new Set(debts.map((x) => x.saleId));
    for (const x of debts) {
      await tx.tecDebt.upsert({
        where: { tecnofitSaleId: x.saleId },
        create: { tecnofitSaleId: x.saleId, customerId: cust.id, dueDate: x.dueDate ? d(x.dueDate) : null, openValue: dec(x.openValue), firstOpenValue: dec(x.openValue), totalValue: dec(x.totalValue), description: x.description, firstSeenOn: d(today), lastSeenOn: d(today) },
        update: { customerId: cust.id, dueDate: x.dueDate ? d(x.dueDate) : null, openValue: dec(x.openValue), totalValue: dec(x.totalValue), description: x.description, status: 'ABERTO', paidOn: null, lastSeenOn: d(today) },
      });
    }
    const gone = await tx.tecDebt.findMany({ where: { customerId: cust.id, status: 'ABERTO', tecnofitSaleId: { notIn: [...seen] } } });
    // Venda que só saiu da janela de cobrança mas segue em aberto na Tecnofit (vencimento adiado) não é pagamento.
    const stillOpen = new Set(sales.filter((s) => money(s.openValue) > 0.004).map((s) => String(s.id)));
    for (const g of gone) {
      if (stillOpen.has(g.tecnofitSaleId)) {
        await tx.tecDebt.update({ where: { id: g.id }, data: { status: 'FORA_DA_JANELA', lastSeenOn: d(today) } });
        continue;
      }
      await tx.tecDebt.update({ where: { id: g.id }, data: { status: 'QUITADO', paidOn: d(today) } });
      paid++;
    }

    const open = await tx.tecDebt.findMany({ where: { customerId: cust.id, status: 'ABERTO' }, orderBy: { dueDate: 'asc' } });
    const oldestDue = open.find((x) => x.dueDate)?.dueDate ?? null;

    // Caso de COBRANÇA (valores recalculados dos débitos a cada rodada: rodar de novo não duplica).
    const cob = await tx.crmCase.findFirst({ where: { customerId: cust.id, kind: 'COBRANCA', status: 'ABERTO' } });
    if (open.length) {
      const openedOn = cob ? iso(cob.openedOn)! : today;
      const v = await caseValues(tx, cust.id, openedOn);
      if (cob) {
        await tx.crmCase.update({ where: { id: cob.id }, data: { ...v, oldestDue, ...(cob.ownerId ? {} : { ownerId: owner }) } });
      } else {
        const created = await tx.crmCase.create({ data: { customerId: cust.id, kind: 'COBRANCA', ownerId: owner, openedOn: d(today), ...v, oldestDue } });
        await audit(tx, SYSTEM, { action: 'crm.case_opened', entityType: 'crm_case', entityId: created.id, after: { kind: 'COBRANCA', openValue: num(v.openValue), ownerId: owner }, summary: `Sincronização Tecnofit abriu caso de cobrança (aluno Tecnofit ${p.id})` });
        opened++;
      }
    } else if (cob) {
      const v = await caseValues(tx, cust.id, iso(cob.openedOn)!);
      await tx.crmCase.update({ where: { id: cob.id }, data: { ...v, status: 'RESOLVIDO', closedOn: d(today), closeReason: 'Sem valor em aberto na Tecnofit' } });
      await audit(tx, SYSTEM, { action: 'crm.case_resolved', entityType: 'crm_case', entityId: cob.id, after: { recovered: num(v.recoveredValue) }, summary: `Sincronização Tecnofit resolveu caso de cobrança (aluno Tecnofit ${p.id}): sem valor em aberto` });
      resolved++;
    }

    // Caso de PENDÊNCIA NA RECEPÇÃO: bloqueado/restrito sem venda em aberto.
    const pen = await tx.crmCase.findFirst({ where: { customerId: cust.id, kind: 'PENDENCIA', status: 'ABERTO' } });
    const pendencia = isBlockedStatus(p.status) && !open.length;
    if (pendencia && !pen) {
      const created = await tx.crmCase.create({ data: { customerId: cust.id, kind: 'PENDENCIA', ownerId: owner, openedOn: d(today) } });
      await audit(tx, SYSTEM, { action: 'crm.case_opened', entityType: 'crm_case', entityId: created.id, after: { kind: 'PENDENCIA', status: p.status, ownerId: owner }, summary: `Sincronização Tecnofit abriu pendência na recepção (aluno Tecnofit ${p.id})` });
      opened++;
    } else if (!pendencia && pen) {
      const reason = open.length ? 'Virou caso de cobrança (há venda em aberto)' : 'Aluno não está mais bloqueado/restrito na Tecnofit';
      await tx.crmCase.update({ where: { id: pen.id }, data: { status: 'RESOLVIDO', closedOn: d(today), closeReason: reason } });
      await audit(tx, SYSTEM, { action: 'crm.case_resolved', entityType: 'crm_case', entityId: pen.id, summary: `Sincronização Tecnofit resolveu pendência (aluno Tecnofit ${p.id}): ${reason}` });
      resolved++;
    } else if (pen && !pen.ownerId && owner) {
      await tx.crmCase.update({ where: { id: pen.id }, data: { ownerId: owner } });
    }
  });
  return { opened, resolved, paid };
}

/** LGPD: tira do espelho quem não tem caso e não aparece há mais de RETENTION_DAYS. */
async function purgeStale(today: IsoDate): Promise<number> {
  const r = await prisma.tecCustomer.deleteMany({ where: { lastSeenOn: { lt: d(addDays(today, -RETENTION_DAYS)) }, cases: { none: {} }, tasks: { none: { status: 'ABERTA' } } } });
  return r.count;
}

/**
 * Roda (ou continua) a sincronização do dia. `force` recomeça mesmo que o dia já tenha
 * concluído. `budgetMs` limita o tempo desta chamada (a Vercel corta em maxDuration).
 */
/**
 * Trava: só uma sincronização por vez (o agendamento de 10 em 10 min, a continuação automática e o
 * botão podiam rodar juntos e estourar o limite de 200 req/min da Tecnofit → erro 429). Usa a tabela
 * de controle de consultas (`tv_checkin_sync`, tipo SYNC_LOCK): quem pega a trava roda até o fim do
 * orçamento; uma execução que cair no meio libera sozinha quando o prazo vence.
 */
const LOCK_KIND = 'SYNC_LOCK';
async function claimSyncLock(today: IsoDate, ms: number): Promise<boolean> {
  await prisma.tvCheckinSync.createMany({ data: [{ day: d(today), kind: LOCK_KIND, fetchedAt: new Date(0) }], skipDuplicates: true });
  const r = await prisma.tvCheckinSync.updateMany({ where: { day: d(today), kind: LOCK_KIND, fetchedAt: { lt: new Date() } }, data: { fetchedAt: new Date(Date.now() + ms) } });
  return r.count === 1;
}
const releaseSyncLock = (today: IsoDate) => prisma.tvCheckinSync.updateMany({ where: { day: d(today), kind: LOCK_KIND }, data: { fetchedAt: new Date(0) } });

export async function runTecnofitSync(today: IsoDate, opts: { budgetMs?: number; force?: boolean; actorId?: string | null } = {}): Promise<SyncResult> {
  const budget = opts.budgetMs ?? 240_000;
  // Prazo da trava: o orçamento + folga para o último aluno e para salvar.
  if (!(await claimSyncLock(today, budget + 90_000))) {
    const cur = await prisma.tecSyncRun.findFirst({ where: { day: d(today) }, orderBy: { startedAt: 'desc' } });
    const stats = (cur?.stats ?? {}) as Stats;
    return { runId: cur?.id ?? '', status: 'OCUPADA', processed: stats.processed ?? 0, remaining: Array.isArray(cur?.pending) ? cur.pending.length : 0, stats };
  }
  try {
    return await runLocked(today, budget, opts);
  } finally {
    await releaseSyncLock(today);
  }
}

async function runLocked(today: IsoDate, budget: number, opts: { force?: boolean; actorId?: string | null }): Promise<SyncResult> {
  const startedAt = Date.now();
  const { api, cfg, callsMade } = await tecnofitApi();

  let run = await prisma.tecSyncRun.findFirst({ where: { day: d(today) }, orderBy: { startedAt: 'desc' } });
  if (run && run.status === 'CONCLUIDA' && !opts.force) {
    const stats = run.stats as Stats;
    return { runId: run.id, status: run.status, processed: stats.processed ?? 0, remaining: 0, stats };
  }
  if (!run || run.status !== 'RODANDO') {
    // Rodada de dia anterior que ficou pela metade não continua mais (a de hoje refaz tudo).
    await prisma.tecSyncRun.updateMany({ where: { status: 'RODANDO', day: { lt: d(today) } }, data: { status: 'INTERROMPIDA', finishedAt: new Date(), error: 'Não terminou no dia; a rodada seguinte refez tudo.' } });
    run = await prisma.tecSyncRun.create({ data: { day: d(today), mode: cfg.fake ? 'SIMULADO' : 'REAL', triggeredBy: opts.actorId ?? null, pending: [], stats: {} } });
    try {
      const prep = await prepare(api, today);
      run = await prisma.tecSyncRun.update({ where: { id: run.id }, data: { pending: prep.pending as unknown as Prisma.InputJsonValue, stats: { candidates: prep.pending.length, processed: 0, casesOpened: 0, casesResolved: 0, debtsPaid: 0, consultants: prep.consultants, errors: [], ...(prep.warning ? { warning: prep.warning } : {}) } } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      run = await prisma.tecSyncRun.update({ where: { id: run.id }, data: { status: 'FALHOU', error: msg.slice(0, 500), finishedAt: new Date(), apiCalls: callsMade() } });
      return { runId: run.id, status: 'FALHOU', processed: 0, remaining: 0, stats: {} };
    }
  }

  const pending = [...(run.pending as unknown as Pending[])];
  const stats: Stats = { ...(run.stats as Stats) };
  stats.errors = [...(stats.errors ?? [])];
  const save = (status = 'RODANDO') => prisma.tecSyncRun.update({
    where: { id: run!.id },
    data: { pending: pending as unknown as Prisma.InputJsonValue, stats: stats as Prisma.InputJsonValue, status, ...(status !== 'RODANDO' ? { finishedAt: new Date() } : {}) },
  });

  let n = 0;
  while (pending.length && Date.now() - startedAt < budget) {
    const p = pending[0]!;
    try {
      const r = await processCustomer(api, p, today);
      stats.casesOpened = (stats.casesOpened ?? 0) + r.opened;
      stats.casesResolved = (stats.casesResolved ?? 0) + r.resolved;
      stats.debtsPaid = (stats.debtsPaid ?? 0) + r.paid;
    } catch (e) {
      // Erro num aluno não derruba a rodada; ele fica sem atualização hoje (nada é resolvido por engano).
      if (stats.errors.length < 50) stats.errors.push({ customer: p.id, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
    pending.shift();
    stats.processed = (stats.processed ?? 0) + 1;
    if (++n % SAVE_EVERY === 0) await save();
  }

  // Vendas lidas e quantas trazem vendedor (sem dado de aluno): mostra se o responsável pela venda está chegando.
  const ds = api.diag?.sales;
  if (ds) {
    stats.salesRead = (stats.salesRead ?? 0) + ds.total;
    stats.salesWithSeller = (stats.salesWithSeller ?? 0) + ds.withSeller;
    if (!stats.salesShape && ds.shape) stats.salesShape = ds.shape.slice(0, 300);
  }
  const done = pending.length === 0;
  if (done && (stats.salesRead ?? 0) > 0 && !stats.salesWithSeller) {
    stats.warning = `${stats.warning ? `${stats.warning} ` : ''}As vendas também vieram sem vendedor/consultor (campos: ${(stats.salesShape ?? '').slice(0, 200)}): sem responsável automático.`.slice(0, 600);
  }
  if (done) {
    stats.purged = await purgeStale(today);
    // Tarefas do dia já prontas quando o consultor abrir a lista (o envio das 07h30 gera de novo, sem duplicar).
    const t = await generateTasks(today);
    stats.tasksCreated = t.created;
    stats.tasksDone = t.done + t.closed;
  }
  const final = await prisma.tecSyncRun.update({
    where: { id: run.id },
    data: { pending: pending as unknown as Prisma.InputJsonValue, stats: stats as Prisma.InputJsonValue, status: done ? 'CONCLUIDA' : 'RODANDO', invocations: { increment: 1 }, apiCalls: { increment: callsMade() }, ...(done ? { finishedAt: new Date() } : {}) },
  });
  return { runId: final.id, status: final.status, processed: stats.processed ?? 0, remaining: pending.length, stats };
}
