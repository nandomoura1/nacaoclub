/**
 * Universidade Nação (puro): áreas, formatos, quem vê o quê e progresso nas trilhas.
 */

export const EDU_AREAS = [
  { id: 'ESSENCIAL', label: 'Essenciais', hint: 'O que todo colaborador precisa conhecer: onboarding, manual, checklists.' },
  { id: 'TECNICA', label: 'Área Técnica', hint: 'Protocolos, padrões de aula, segurança e atendimento, por modalidade e setor.' },
  { id: 'GESTAO', label: 'Área de Gestão', hint: 'Liderança, rituais, indicadores e processos para gestores e líderes.' },
] as const;
export type EduArea = (typeof EDU_AREAS)[number]['id'];

export const EDU_FORMATS = [
  { id: 'APRESENTACAO', label: 'Apresentação' },
  { id: 'PDF', label: 'PDF' },
  { id: 'EBOOK', label: 'E-book' },
  { id: 'AUDIO', label: 'Áudio / audiobook' },
  { id: 'VIDEO', label: 'Vídeo' },
  { id: 'DOCUMENTO', label: 'Documento / planilha' },
  { id: 'LINK', label: 'Link' },
  { id: 'OUTRO', label: 'Outro' },
] as const;

export const EDU_AUDIENCES = [
  { id: 'TODOS', label: 'Todos os colaboradores' },
  { id: 'LIDERES', label: 'Líderes e gestores' },
  { id: 'PROFESSORES', label: 'Professores' },
  { id: 'PERFIL', label: 'Um perfil de acesso' },
] as const;

export const labelOf = (list: readonly { id: string; label: string }[], id: string | null | undefined) => list.find((x) => x.id === id)?.label ?? id ?? '—';

/** Limite por arquivo (o do bucket). Áudio/vídeo maiores: link do Drive/YouTube/Spotify. */
export const EDU_MAX_BYTES = 50 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: 'application/pdf', epub: 'application/epub+zip',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', zip: 'application/zip',
  // Página/apresentação em HTML (ex.: exportada de ferramenta de slides). Abre isolada, ver /universidade/ver.
  html: 'text/html', htm: 'text/html',
};
export const EDU_ACCEPT = Object.keys(MIME).map((e) => `.${e}`).join(',');
const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? '';
export const eduMime = (fileName: string) => MIME[ext(fileName)] ?? null;

/** Formato sugerido pelo arquivo (ou pelo link). */
export function guessFormat(fileNameOrUrl: string): string {
  const s = fileNameOrUrl.toLowerCase();
  const m = eduMime(s) ?? '';
  if (m.startsWith('audio/') || /spotify|soundcloud|anchor\.fm/.test(s)) return 'AUDIO';
  if (m.startsWith('video/') || /youtube|youtu\.be|vimeo/.test(s)) return 'VIDEO';
  if (m === 'application/epub+zip') return 'EBOOK';
  if (m === 'text/html' || /presentation|powerpoint/.test(m) || /canva\.com|docs\.google\.com\/presentation|gamma\.app/.test(s)) return 'APRESENTACAO';
  if (m === 'application/pdf') return 'PDF';
  if (/word|sheet|excel/.test(m) || /docs\.google\.com\/(document|spreadsheets)/.test(s)) return 'DOCUMENTO';
  return /^https?:\/\//.test(s) ? 'LINK' : 'OUTRO';
}

/** Caminho no bucket: universidade/AAAA-MM/<id>-<nome-limpo>.<ext> */
export function eduPath(id: string, fileName: string, now = new Date()): string {
  const e = ext(fileName);
  const clean = fileName.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'arquivo';
  return `universidade/${now.toISOString().slice(0, 7)}/${id}-${clean}${e ? `.${e}` : ''}`;
}
export const EDU_PATH_RE = /^universidade\/\d{4}-\d{2}\/[0-9a-f-]{36}-[a-z0-9.-]+$/;

/** Link do YouTube → endereço para tocar dentro do app (null se não for YouTube). */
export function youtubeEmbed(url: string | null | undefined): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export interface Viewer { editor: boolean; leader: boolean; teacher: boolean; roleKeys: string[] }

/** Quem vê o material/trilha. Quem publica (diretoria e líderes) vê tudo. */
export function canSee(item: { audience: string; roleKey: string | null; active?: boolean }, v: Viewer): boolean {
  if (v.editor) return true;
  if (item.active === false) return false;
  if (item.audience === 'LIDERES') return v.leader;
  if (item.audience === 'PROFESSORES') return v.teacher || v.leader;
  if (item.audience === 'PERFIL') return !!item.roleKey && v.roleKeys.includes(item.roleKey);
  return true;
}

/** Progresso numa trilha: concluídos, total e o próximo a fazer. */
export function trackProgress(items: { materialId: string }[], done: Set<string>) {
  const total = items.length;
  const completed = items.filter((i) => done.has(i.materialId)).length;
  const next = items.find((i) => !done.has(i.materialId))?.materialId ?? null;
  return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0, next, finished: total > 0 && completed === total };
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
