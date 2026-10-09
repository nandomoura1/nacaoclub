import { PDFDocument } from 'pdf-lib';
import { AppError } from '@/server/errors';

/**
 * Vários prints de tela → um PDF (uma página por print, na ordem enviada).
 * Assim um documento partido em várias telas vira um arquivo só, guardado e
 * lido de uma vez pela extração.
 */
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Prints de tela');
  for (const [i, f] of files.entries()) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50; // assinatura PNG
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpg) throw new AppError(`O print ${i + 1} (${f.name}) não é PNG nem JPG.`);
    const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Página no tamanho da imagem (largura até 1200 pt; PDF aceita até 14.400 pt).
    const scale = Math.min(1, 1200 / img.width, 14_000 / img.height);
    const page = pdf.addPage([img.width * scale, img.height * scale]);
    page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
  }
  return pdf.save();
}
