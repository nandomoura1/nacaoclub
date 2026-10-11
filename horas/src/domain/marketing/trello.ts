import { AREAS, isDone, TASK_COLUMNS, type AreaKey, type TaskColumn } from './constants';

/**
 * Importação de um quadro do Trello (arquivo "Exportar como JSON").
 * Puro: roda no navegador (o arquivo do Trello pode ser grande; só o essencial
 * vai para o servidor) e no servidor (que revalida e monta o plano de novo).
 */

export interface TrelloList { id: string; name: string; closed: boolean; cards: number }
export interface TrelloLabel { id: string; name: string; color: string | null; cards: number }
export interface TrelloMember { id: string; name: string; username: string | null; cards: number }
export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  listId: string;
  closed: boolean;
  /** Prazo já convertido para a data de Brasília (AAAA-MM-DD). */
  due: string | null;
  /** "Concluído" marcado no prazo do card. */
  done: boolean;
  memberIds: string[];
  labelIds: string[];
  checklists: { name: string; items: { text: string; done: boolean }[] }[];
  attachments: { name: string; url: string }[];
  comments: { author: string; date: string; text: string }[];
  url: string | null;
  pos: number;
}
export interface TrelloBoard { name: string; url: string | null; lists: TrelloList[]; labels: TrelloLabel[]; members: TrelloMember[]; cards: TrelloCard[] }

export const TRELLO_LIMITS = { cards: 2000, desc: 5000, items: 100, links: 20, comments: 50, text: 2000 } as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Trello guarda o prazo em UTC; Brasília é UTC−3 (sem horário de verão desde 2019). */
export function trelloDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Lê o JSON exportado pelo Trello. Lança erro com mensagem amigável se não for um quadro. */
export function parseTrelloBoard(raw: unknown): TrelloBoard {
  if (!isObj(raw) || !Array.isArray(raw.lists) || !Array.isArray(raw.cards)) {
    throw new Error('Este arquivo não parece ser a exportação JSON de um quadro do Trello.');
  }
  const checklists = new Map<string, Obj>();
  for (const c of arr(raw.checklists)) if (isObj(c)) checklists.set(str(c.id), c);
  const comments = new Map<string, TrelloCard['comments']>();
  for (const a of arr(raw.actions)) {
    if (!isObj(a) || a.type !== 'commentCard' || !isObj(a.data) || !isObj(a.data.card)) continue;
    const id = str(a.data.card.id);
    const list = comments.get(id) ?? [];
    const author = isObj(a.memberCreator) ? str(a.memberCreator.fullName, 100) || str(a.memberCreator.username, 100) : '';
    list.push({ author: author || 'alguém', date: trelloDate(a.date) ?? '', text: str(a.data.text, TRELLO_LIMITS.text) });
    comments.set(id, list);
  }

  const cards: TrelloCard[] = arr(raw.cards).filter(isObj).slice(0, TRELLO_LIMITS.cards).map((c) => {
    const ownChecklists = arr(c.idChecklists).map((id) => checklists.get(str(id))).filter(isObj);
    // Exportações antigas trazem o idCard na checklist e não o idChecklists no card.
    const lists = ownChecklists.length ? ownChecklists : [...checklists.values()].filter((x) => str(x.idCard) === str(c.id));
    return {
      id: str(c.id, 64),
      name: str(c.name, 300).trim() || '(sem título)',
      desc: str(c.desc, TRELLO_LIMITS.desc),
      listId: str(c.idList, 64),
      closed: c.closed === true,
      due: trelloDate(c.due),
      done: c.dueComplete === true,
      memberIds: arr(c.idMembers).map((x) => str(x, 64)).filter(Boolean),
      labelIds: arr(c.idLabels).map((x) => str(x, 64)).filter(Boolean),
      checklists: lists.map((l) => ({
        name: str(l.name, 200),
        items: arr(l.checkItems).filter(isObj).sort((a, b) => num(a.pos) - num(b.pos)).slice(0, TRELLO_LIMITS.items)
          .map((i) => ({ text: str(i.name, 500).trim(), done: i.state === 'complete' })).filter((i) => i.text),
      })).filter((l) => l.items.length),
      attachments: arr(c.attachments).filter(isObj).map((a) => ({ name: str(a.name, 100), url: str(a.url, 1000) }))
        .filter((a) => /^https?:\/\//.test(a.url)).slice(0, TRELLO_LIMITS.links),
      comments: (comments.get(str(c.id)) ?? []).slice(0, TRELLO_LIMITS.comments).reverse(),
      url: str(c.shortUrl, 300) || str(c.url, 300) || null,
      pos: num(c.pos),
    };
  }).filter((c) => c.id && c.listId);

  const count = (pick: (c: TrelloCard) => string[]) => {
    const m = new Map<string, number>();
    for (const c of cards) for (const k of pick(c)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const byList = count((c) => [c.listId]);
  const byLabel = count((c) => c.labelIds);
  const byMember = count((c) => c.memberIds);

  return {
    name: str(raw.name, 200) || 'Quadro do Trello',
    url: str(raw.shortUrl, 300) || str(raw.url, 300) || null,
    lists: arr(raw.lists).filter(isObj).sort((a, b) => num(a.pos) - num(b.pos))
      .map((l) => ({ id: str(l.id, 64), name: str(l.name, 200) || '(sem nome)', closed: l.closed === true, cards: byList.get(str(l.id)) ?? 0 })),
    labels: arr(raw.labels).filter(isObj)
      .map((l) => ({ id: str(l.id, 64), name: str(l.name, 100), color: str(l.color, 30) || null, cards: byLabel.get(str(l.id)) ?? 0 })),
    members: arr(raw.members).filter(isObj)
      .map((m) => ({ id: str(m.id, 64), name: str(m.fullName, 120) || str(m.username, 120) || 'Membro', username: str(m.username, 120) || null, cards: byMember.get(str(m.id)) ?? 0 })),
    cards,
  };
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sugere a coluna do Kanban pelo nome da lista do Trello. */
export function guessColumn(listName: string): TaskColumn {
  const n = norm(listName);
  if (/(feito|conclu|done|finaliz|entregue|publicad|realizad|executad)/.test(n)) return 'EXECUTADO';
  if (/(resultado|metrica|analise|report)/.test(n)) return 'RESULTADOS';
  if (/(agendad|programad|scheduled)/.test(n)) return 'PROGRAMADO';
  if (/(aprova|revis|review|validac|ajuste)/.test(n)) return 'APROVACAO';
  if (/(fazendo|andamento|producao|doing|progress|execu|desenvolv)/.test(n)) return 'PRODUCAO';
  if (/(semana|hoje|today|this week|urgente)/.test(n)) return 'SEMANA';
  if (/(a fazer|to ?do|proxim|next|pendente|planejad)/.test(n)) return 'PROXIMAS';
  return 'BACKLOG';
}

/** Sugere a área por palavras-chave (etiqueta ou título). */
export function guessArea(text: string): AreaKey | null {
  const n = norm(text);
  if (/(design|arte|criativ|identidade|layout|banner|logo|peca)/.test(n)) return 'DESIGN';
  if (/(reels?|video|post|conteudo|social|insta|stories|story|tiktok|feed|roteiro|foto|carrossel|youtube)/.test(n)) return 'CONTEUDO';
  if (/(comercial|venda|lead|oferta|matricula|preco|crm|consultor)/.test(n)) return 'COMERCIAL';
  if (/(comunica|interno|whats|recepcao|equipe|endomarketing|mural|\btv\b|aviso|e-?mail)/.test(n)) return 'COMUNICACAO';
  if (/(planej|campanha|estrateg|briefing|calendario|evento)/.test(n)) return 'PLANEJAMENTO';
  return null;
}

export type ListTarget = TaskColumn | 'IGNORAR';
export interface TrelloMapping {
  lists: Record<string, ListTarget>;
  labels: Record<string, AreaKey | ''>;
  members: Record<string, string>;
  campaignId: string | null;
  includeArchived: boolean;
  /** Sem etiqueta mapeada, deduz a área pelo título do card. */
  guessAreaFromTitle: boolean;
  importComments: boolean;
}

export function suggestMapping(b: TrelloBoard): TrelloMapping {
  return {
    lists: Object.fromEntries(b.lists.map((l) => [l.id, l.closed ? 'IGNORAR' : guessColumn(l.name)])),
    labels: Object.fromEntries(b.labels.map((l) => [l.id, (l.name && guessArea(l.name)) || ''])),
    // Pessoas nunca são ligadas automaticamente pelo nome: quem importa escolhe.
    members: Object.fromEntries(b.members.map((m) => [m.id, ''])),
    campaignId: null, includeArchived: false, guessAreaFromTitle: true, importComments: true,
  };
}

export interface PlannedTask {
  ref: string;
  title: string;
  description: string | null;
  column: TaskColumn;
  areaKey: AreaKey | null;
  areaGuessed: boolean;
  assigneeId: string | null;
  collaboratorIds: string[];
  dueDate: string | null;
  tags: string[];
  checklist: { text: string; done: boolean }[];
  links: { url: string; label: string | null }[];
  comments: string[];
  listName: string;
}
export interface ImportPlan {
  tasks: PlannedTask[];
  skipped: { ignoredList: number; archived: number; duplicates: number };
}

export const trelloRef = (cardId: string) => `trello:${cardId}`;
const COLUMN_IDS = new Set<string>(TASK_COLUMNS.map((c) => c.id));
const AREA_KEYS = new Set<string>(AREAS.map((a) => a.key));
const fmtBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/** O que será criado, na ordem das listas e dos cards do quadro. */
export function planImport(b: TrelloBoard, m: TrelloMapping, alreadyImported: ReadonlySet<string> = new Set()): ImportPlan {
  const lists = new Map(b.lists.map((l) => [l.id, l]));
  const labels = new Map(b.labels.map((l) => [l.id, l]));
  const listOrder = new Map(b.lists.map((l, i) => [l.id, i]));
  const skipped = { ignoredList: 0, archived: 0, duplicates: 0 };
  const tasks: PlannedTask[] = [];
  const cards = [...b.cards].sort((x, y) => (listOrder.get(x.listId) ?? 0) - (listOrder.get(y.listId) ?? 0) || x.pos - y.pos);
  for (const c of cards) {
    const list = lists.get(c.listId);
    const target = m.lists[c.listId] ?? 'IGNORAR';
    if (target === 'IGNORAR' || !COLUMN_IDS.has(target)) { skipped.ignoredList++; continue; }
    if ((c.closed || list?.closed) && !m.includeArchived) { skipped.archived++; continue; }
    if (alreadyImported.has(trelloRef(c.id))) { skipped.duplicates++; continue; }
    const labelArea = c.labelIds.map((id) => m.labels[id]).find((a): a is AreaKey => !!a && AREA_KEYS.has(a)) ?? null;
    const titleArea = !labelArea && m.guessAreaFromTitle ? guessArea(c.name) : null;
    const people = c.memberIds.map((id) => m.members[id]).filter((x): x is string => !!x);
    const uniquePeople = [...new Set(people)];
    const multi = c.checklists.length > 1;
    const desc = [c.desc.trim(), c.url ? `— Importado do Trello: ${c.url}` : '— Importado do Trello'].filter(Boolean).join('\n\n');
    tasks.push({
      ref: trelloRef(c.id),
      title: c.name.slice(0, 200),
      description: desc.slice(0, TRELLO_LIMITS.desc),
      // Card com o prazo marcado como concluído vai para "Executado".
      column: c.done && !isDone(target) ? 'EXECUTADO' : target,
      areaKey: labelArea ?? titleArea,
      areaGuessed: !labelArea && !!titleArea,
      assigneeId: uniquePeople[0] ?? null,
      collaboratorIds: uniquePeople.slice(1),
      dueDate: c.due,
      tags: [...new Set(c.labelIds.map((id) => labels.get(id)?.name.trim() ?? '').filter(Boolean).map((t) => t.slice(0, 30)))].slice(0, 10),
      checklist: c.checklists.flatMap((l) => l.items.map((i) => ({ text: (multi && l.name ? `${l.name}: ${i.text}` : i.text).slice(0, 500), done: i.done }))).slice(0, TRELLO_LIMITS.items),
      links: c.attachments.map((a) => ({ url: a.url, label: a.name || null })),
      comments: m.importComments ? c.comments.filter((x) => x.text.trim()).map((x) => `Trello · ${x.author}${x.date ? ` (${fmtBR(x.date)})` : ''}: ${x.text}`.slice(0, TRELLO_LIMITS.text)) : [],
      listName: list?.name ?? '',
    });
  }
  return { tasks, skipped };
}

/** Versão enxuta do quadro para mandar ao servidor: só os cards que podem entrar. */
export function slimBoard(b: TrelloBoard, m: TrelloMapping): TrelloBoard {
  return { ...b, cards: b.cards.filter((c) => m.lists[c.listId] && m.lists[c.listId] !== 'IGNORAR' && (m.includeArchived || !c.closed)) };
}
