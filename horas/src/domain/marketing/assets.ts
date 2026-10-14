/**
 * Biblioteca de criativos (puro): tipos de arquivo, status de aprovação,
 * caminho no storage e regras de quem pode fazer o quê.
 */

export const ASSET_KINDS = [
  { id: 'ARTE', label: 'Arte / post' },
  { id: 'VIDEO', label: 'Vídeo / reels' },
  { id: 'FOTO', label: 'Foto' },
  { id: 'LOGO', label: 'Logo / marca' },
  { id: 'TEMPLATE', label: 'Template / editável' },
  { id: 'DOCUMENTO', label: 'Documento / PDF' },
  { id: 'OUTRO', label: 'Outro' },
] as const;

export const ASSET_STATUSES = [
  { id: 'RASCUNHO', label: 'Rascunho', tone: 'neutral' },
  { id: 'EM_APROVACAO', label: 'Em aprovação', tone: 'amber' },
  { id: 'AJUSTES', label: 'Pedir ajustes', tone: 'red' },
  { id: 'APROVADO', label: 'Aprovado', tone: 'green' },
  { id: 'ARQUIVADO', label: 'Arquivado', tone: 'neutral' },
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number]['id'];

/** Limite por arquivo (o mesmo do bucket no Supabase). */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', zip: 'application/zip',
  ai: 'application/postscript', eps: 'application/postscript', psd: 'image/vnd.adobe.photoshop',
};
export const ACCEPT = Object.keys(MIME).map((e) => `.${e}`).join(',');

const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? '';

/** Tipo de conteúdo aceito para o arquivo (pela extensão; null = não aceito). */
export function assetMime(fileName: string): string | null {
  return MIME[ext(fileName)] ?? null;
}

/** Tipo sugerido pelo arquivo. */
export function guessKind(fileName: string): string {
  const m = assetMime(fileName) ?? '';
  if (/logo|marca|brand/i.test(fileName)) return 'LOGO';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m === 'application/pdf') return 'DOCUMENTO';
  if (/postscript|photoshop|zip/.test(m)) return 'TEMPLATE';
  if (m.startsWith('image/')) return /foto|img_|dsc|photo/i.test(fileName) ? 'FOTO' : 'ARTE';
  return 'OUTRO';
}

/** Título legível a partir do nome do arquivo. */
export function titleFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 120) || 'Arquivo';
}

/** Caminho no bucket: biblioteca/AAAA-MM/<id>-<nome-limpo>.<ext> */
export function assetPath(id: string, fileName: string, now = new Date()): string {
  const e = ext(fileName);
  const clean = fileName.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'arquivo';
  return `biblioteca/${now.toISOString().slice(0, 7)}/${id}-${clean}${e ? `.${e}` : ''}`;
}

export const isPreviewable = (mime: string) => /^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(mime) || /^video\/(mp4|webm|quicktime)$/.test(mime);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Próximo status permitido. Quem edita: rascunho ⇄ aprovação, arquivar.
 * Quem aprova: aprovar ou pedir ajustes (com comentário).
 */
export function canMove(from: string, to: string, who: { edit: boolean; approve: boolean }): boolean {
  if (from === to) return false;
  if (to === 'APROVADO' || to === 'AJUSTES') return who.approve && from !== 'ARQUIVADO';
  if (to === 'EM_APROVACAO') return who.edit && ['RASCUNHO', 'AJUSTES'].includes(from);
  if (to === 'RASCUNHO') return who.edit && ['EM_APROVACAO', 'AJUSTES', 'ARQUIVADO', 'APROVADO'].includes(from);
  if (to === 'ARQUIVADO') return who.edit;
  return false;
}
