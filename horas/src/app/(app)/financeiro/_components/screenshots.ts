'use client';

/**
 * Prints de tela para a Central de uploads: reduz e converte para JPG no
 * navegador (cabe no limite de envio e aceita foto do iPhone no Safari).
 * Texto continua legível: lado maior até 2400 px, qualidade 0,88.
 */
const MAX_SIDE = 2400;
const QUALITY = 0.88;
export const MAX_PRINTS = 12;

export const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i.test(f.name);

async function decode(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file);
      return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
    } catch { /* tenta pelo <img> (Safari com HEIC) */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('decode'));
      i.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Imagem → JPG reduzido. Lança erro legível se o navegador não abrir o formato. */
export async function compressImage(file: File, index = 1): Promise<File> {
  let d;
  try {
    d = await decode(file);
  } catch {
    throw new Error(`Não consegui abrir "${file.name}". Salve o print como PNG ou JPG e tente de novo.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(d.w, d.h));
  const w = Math.max(1, Math.round(d.w * scale));
  const h = Math.max(1, Math.round(d.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // PNG transparente vira fundo branco
  ctx.fillRect(0, 0, w, h);
  d.draw(ctx, w, h);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(`Não consegui converter "${file.name}".`);
  const base = file.name.replace(/\.[^.]+$/, '') || `print-${index}`;
  return new File([blob], `${/^image\.?$/i.test(base) ? `print-${index}` : base}.jpg`, { type: 'image/jpeg' });
}

/** Imagens coladas/arrastadas (clipboard ou drop). */
export function imagesFrom(list: DataTransferItemList | FileList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const it of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const f = 'getAsFile' in it ? (it.kind === 'file' ? it.getAsFile() : null) : it;
    if (f && isImage(f)) out.push(f);
  }
  return out;
}
