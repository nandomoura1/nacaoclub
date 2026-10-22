/**
 * Envio de arquivo por server action (navegador). A Vercel recusa corpo acima
 * de ~4,5 MB antes de o servidor ver o pedido — e a página quebrava. Aqui:
 * fotos grandes são reduzidas no próprio navegador; o que ainda passar do
 * limite volta como mensagem, e qualquer falha de rede vira erro na tela.
 */

/** Limite seguro por envio (a Vercel corta em ~4,5 MB, contando o formulário). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '4 MB';

const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/i;

/** Reduz uma foto (lado maior até `maxSide`, JPEG) se ela for grande. HEIC e PDF passam como estão. */
async function shrinkImage(file: File, maxSide = 2400, quality = 0.85): Promise<File> {
  if (!COMPRESSIBLE.test(file.type) || file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // PNG transparente vira fundo branco no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Prepara o arquivo para envio: reduz fotos e confere o tamanho. */
export async function prepareUpload(file: File): Promise<{ file: File } | { error: string }> {
  const out = await shrinkImage(file);
  if (out.size > MAX_UPLOAD_BYTES) {
    const mb = (out.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return {
      error: /\.pdf$/i.test(out.name)
        ? `“${out.name}” tem ${mb} MB e o limite é ${MAX_UPLOAD_LABEL}. Comprima o PDF (ex.: ilovepdf.com/pt/comprimir_pdf) ou escaneie em qualidade menor e envie de novo.`
        : `“${out.name}” tem ${mb} MB e o limite é ${MAX_UPLOAD_LABEL}. Tire a foto de novo em resolução menor ou envie em JPG.`,
    };
  }
  return { file: out };
}

/** Chama a action sem derrubar a página: erro de rede ou arquivo grande vira mensagem. */
export async function safeUpload<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: `Não foi possível enviar. Confira a internet e o tamanho do arquivo (até ${MAX_UPLOAD_LABEL}) e tente de novo.` };
  }
}
