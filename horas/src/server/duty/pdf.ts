import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatClock } from '@/domain/dates';
import { dayTitle } from '@/domain/duty';
import * as A from '@/server/workouts/assets.generated';

/**
 * PDF da escala (A4 retrato), no padrão Nação: faixa azul com a logo, um bloco
 * por setor, um dia por linha de cabeçalho, turnos com horário e nomes.
 * Texto vetorial (pesquisável, leve para mandar no WhatsApp).
 */
export interface DutyPdfInput {
  title: string;
  generatedAt: string;
  holidays: Record<string, string>;
  sectors: { name: string; color: string; shifts: { date: string; startMin: number; endMin: number; notes: string | null; people: { name: string }[] }[] }[];
}

const hex = (h: string) => {
  const n = Number.parseInt(h.replace('#', ''), 16);
  return Number.isNaN(n) ? rgb(0.004, 0.41, 0.91) : rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const NAVY = hex('#022B57');
const BLUE = hex('#0169E9');
const INK = hex('#1E293B');
const SOFT = hex('#64748B');
const LINE = hex('#E2E8F0');
const WHITE = rgb(1, 1, 1);
const buf = (b64: string) => Buffer.from(b64, 'base64');

const W = 595.28;
const H = 841.89;
const M = 40;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export async function dutyPdf(input: DutyPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Escala · ${input.title}`);
  doc.setProducer('Nação | Gestão de Horas');
  const [regular, bold, heavy, cond] = await Promise.all([
    doc.embedFont(buf(A.montserrat500), { subset: true }),
    doc.embedFont(buf(A.montserrat700), { subset: true }),
    doc.embedFont(buf(A.montserrat800), { subset: true }),
    doc.embedFont(buf(A.barlow800), { subset: true }),
  ]);
  const logo = await doc.embedPng(buf(A.logoBranco));

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const newPage = () => {
    page = doc.addPage([W, H]);
    pageNo += 1;
    const band = pageNo === 1 ? 96 : 44;
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: NAVY });
    page.drawRectangle({ x: 0, y: H - band - 4, width: W, height: 4, color: BLUE });
    if (pageNo === 1) {
      const lw = 150; const lh = lw * (351 / 900);
      page.drawImage(logo, { x: M, y: H - 48 - lh / 2, width: lw, height: lh });
      const t1 = 'ESCALA';
      const t2 = input.title.toUpperCase();
      page.drawText(t1, { x: W - M - cond.widthOfTextAtSize(t1, 16), y: H - 38, size: 16, font: cond, color: hex('#C9DBF7') });
      const size = Math.min(28, (W - 2 * M - 170) / Math.max(1, cond.widthOfTextAtSize(t2, 1)));
      page.drawText(t2, { x: W - M - cond.widthOfTextAtSize(t2, size), y: H - 70, size, font: cond, color: WHITE });
    } else {
      page.drawText(`ESCALA · ${input.title.toUpperCase()}`, { x: M, y: H - 28, size: 13, font: cond, color: WHITE });
    }
    page.drawText('Muitos esportes, muitas paixões, uma Nação!', { x: M, y: 22, size: 8, font: bold, color: BLUE });
    const foot = `Gerado em ${input.generatedAt} · página ${pageNo}`;
    page.drawText(foot, { x: W - M - regular.widthOfTextAtSize(foot, 8), y: 22, size: 8, font: regular, color: SOFT });
    y = H - band - 28;
  };
  const ensure = (need: number) => { if (y - need < 48) newPage(); };

  newPage();
  const sectors = input.sectors.filter((s) => s.shifts.length);
  if (!sectors.length) {
    page.drawText('Nenhum turno lançado neste período.', { x: M, y, size: 12, font: regular, color: SOFT });
  }

  const timeW = 78;
  const peopleX = M + 12 + timeW;
  const peopleW = W - M - peopleX;
  for (const s of sectors) {
    ensure(70);
    page.drawRectangle({ x: M, y: y - 6, width: 5, height: 22, color: hex(s.color) });
    page.drawText(s.name.toUpperCase(), { x: M + 12, y: y, size: 17, font: cond, color: NAVY });
    y -= 22;
    const byDate = new Map<string, typeof s.shifts>();
    for (const sh of [...s.shifts].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)) byDate.set(sh.date, [...(byDate.get(sh.date) ?? []), sh]);
    for (const [date, list] of byDate) {
      ensure(44);
      page.drawText(dayTitle(date, input.holidays[date]), { x: M + 12, y, size: 10.5, font: heavy, color: BLUE });
      y -= 6;
      page.drawLine({ start: { x: M + 12, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
      y -= 13;
      for (const sh of list) {
        const names = sh.people.map((p) => p.name).join(', ') || 'a definir';
        const nameLines = wrap(names, sh.people.length ? bold : regular, 10.5, peopleW);
        const noteLines = sh.notes ? wrap(sh.notes, regular, 9, peopleW) : [];
        ensure(nameLines.length * 14 + noteLines.length * 12 + 6);
        page.drawText(`${formatClock(sh.startMin)}–${formatClock(sh.endMin)}`, { x: M + 12, y, size: 10.5, font: bold, color: INK });
        for (const l of nameLines) {
          page.drawText(l, { x: peopleX, y, size: 10.5, font: sh.people.length ? bold : regular, color: sh.people.length ? INK : hex('#B45309') });
          y -= 14;
        }
        for (const l of noteLines) {
          page.drawText(l, { x: peopleX, y: y + 2, size: 9, font: regular, color: SOFT });
          y -= 12;
        }
        y -= 4;
      }
      y -= 6;
    }
    y -= 10;
  }
  return doc.save();
}
