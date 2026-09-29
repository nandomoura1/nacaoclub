import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import * as A from '@/server/workouts/assets.generated';

/** Base dos PDFs no padrão Nação: fontes da marca embutidas, logo, cores e quebra de linha. */
export const hex = (h: string) => {
  const n = Number.parseInt(h.replace('#', ''), 16);
  return Number.isNaN(n) ? rgb(0.004, 0.41, 0.91) : rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export const C = {
  navy: hex('#022B57'), blue: hex('#0169E9'), ink: hex('#1E293B'), soft: hex('#64748B'), line: hex('#E2E8F0'),
  pale: hex('#C9DBF7'), amber: hex('#B45309'), amberBg: hex('#FEF3C7'), blueBg: hex('#EEF4FE'), white: rgb(1, 1, 1),
};
export const A4 = { w: 595.28, h: 841.89, m: 40 };
export const LOGO_RATIO = 351 / 900;

export interface Brand { doc: PDFDocument; regular: PDFFont; bold: PDFFont; heavy: PDFFont; cond: PDFFont; logo: PDFImage }

const buf = (b64: string) => Buffer.from(b64, 'base64');

export async function brandDoc(title: string): Promise<Brand> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer('Nação | Gestão de Horas');
  // subset: as fontes vêm em WOFF; o fontkit reescreve só os glifos usados em TrueType.
  const [regular, bold, heavy, cond] = await Promise.all([
    doc.embedFont(buf(A.montserrat500), { subset: true }),
    doc.embedFont(buf(A.montserrat700), { subset: true }),
    doc.embedFont(buf(A.montserrat800), { subset: true }),
    doc.embedFont(buf(A.barlow800), { subset: true }),
  ]);
  return { doc, regular, bold, heavy, cond, logo: await doc.embedPng(buf(A.logoBranco)) };
}

/** Tira o que a fonte não desenha (emoji, símbolos raros) para não sair quadradinho. */
export function clean(font: PDFFont, text: string): string {
  const ok = new Set(font.getCharacterSet());
  return [...text.replace(/\t/g, ' ')].filter((ch) => ok.has(ch.codePointAt(0)!)).join('').replace(/ {2,}/g, ' ').trim();
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of clean(font, text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}
