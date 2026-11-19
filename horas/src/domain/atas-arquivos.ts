/** Arquivos das atas de reunião (propostas, projetos…) — puro. */

export const ATA_FILE_KINDS = [
  { id: 'PROPOSTA', label: 'Proposta' },
  { id: 'PROJETO', label: 'Projeto' },
  { id: 'APRESENTACAO', label: 'Apresentação' },
  { id: 'OUTRO', label: 'Outro' },
] as const;
export type AtaFileKind = (typeof ATA_FILE_KINDS)[number]['id'];

/** Limite por arquivo (o do bucket). */
export const ATA_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Formatos aceitos: documentos, planilhas, apresentações, imagens, zip e HTML (decisão 19/11). Tudo é sempre BAIXADO
 * (link com download=, nunca aberto dentro do app), então o HTML não roda no domínio do sistema. SVG segue fora.
 */
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain', html: 'text/html', htm: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', zip: 'application/zip',
};
export const ATA_ACCEPT = Object.keys(MIME).map((e) => `.${e}`).join(',');
const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? '';
export const ataMime = (fileName: string) => MIME[ext(fileName)] ?? null;

/** Caminho no bucket: atas/AAAA-MM/<id>-<nome-limpo>.<ext> */
export function ataPath(id: string, fileName: string, now = new Date()): string {
  const e = ext(fileName);
  const clean = fileName.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'arquivo';
  return `atas/${now.toISOString().slice(0, 7)}/${id}-${clean}${e ? `.${e}` : ''}`;
}
export const ATA_PATH_RE = /^atas\/\d{4}-\d{2}\/[0-9a-f-]{36}-[a-z0-9.-]+$/;

/** "2,4 MB" */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
