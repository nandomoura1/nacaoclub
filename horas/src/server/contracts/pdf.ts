import type { PDFFont, PDFPage } from 'pdf-lib';
import { contractBlocks, maskPhone, roleLabel, type Block } from '@/domain/contracts';
import { A4, C, LOGO_RATIO, brandDoc, clean } from '@/server/pdf/kit';

/**
 * PDF do contrato (A4): texto com títulos, cláusulas, listas e **negrito**. A versão
 * assinada ganha a página de assinaturas e evidências (quem, quando, IP, dispositivo,
 * método e o hash SHA-256 do texto). Texto vetorial e pesquisável.
 */
export interface ContractPdfInput {
  code: string;
  title: string;
  body: string;
  bodyHash: string | null;
  /** Minuta (antes de assinar): marca "MINUTA" no rodapé. */
  draft: boolean;
  generatedAt: string;
  signers?: {
    name: string; role: string; document: string | null; phone: string | null;
    signedAt: string | null; signedName: string | null; ip: string | null; userAgent: string | null;
  }[];
  events?: { at: string; text: string }[];
}

const { navy: NAVY, blue: BLUE, ink: INK, soft: SOFT, line: LINE, white: WHITE } = C;
const W = A4.w, H = A4.h, M = 56;
const BODY = 10.5, LEAD = 15.5;

type Word = { text: string; bold: boolean };

/** Quebra uma sequência de trechos (normal/negrito) em linhas que cabem na largura. */
function layoutRuns(runs: Block['runs'], regular: PDFFont, bold: PDFFont, size: number, width: number): Word[][] {
  const words: Word[] = [];
  for (const r of runs) for (const t of clean(r.bold ? bold : regular, r.text).split(/\s+/).filter(Boolean)) words.push({ text: t, bold: r.bold });
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let w = 0;
  const space = regular.widthOfTextAtSize(' ', size);
  for (const word of words) {
    const ww = (word.bold ? bold : regular).widthOfTextAtSize(word.text, size);
    if (cur.length && w + space + ww > width) { lines.push(cur); cur = []; w = 0; }
    w += (cur.length ? space : 0) + ww;
    cur.push(word);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

const shortUa = (ua: string | null) => {
  if (!ua) return '—';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'outro';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador';
  return `${br} · ${os}`;
};

export async function contractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const { doc, regular, bold, heavy, cond, logo } = await brandDoc(`${input.code} · ${input.title}`);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    const first = pages.length === 1;
    const band = first ? 78 : 30;
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: NAVY });
    page.drawRectangle({ x: 0, y: H - band - 3, width: W, height: 3, color: BLUE });
    if (first) {
      const lw = 120, lh = lw * LOGO_RATIO;
      page.drawImage(logo, { x: M, y: H - 39 - lh / 2, width: lw, height: lh });
      const t = clean(cond, input.code);
      page.drawText(t, { x: W - M - cond.widthOfTextAtSize(t, 16), y: H - 46, size: 16, font: cond, color: WHITE });
    } else {
      page.drawText(clean(cond, `${input.code} · ${input.title.toUpperCase()}`).slice(0, 80), { x: M, y: H - 20, size: 10, font: cond, color: WHITE });
    }
    y = H - band - 34;
  };
  const ensure = (need: number) => { if (y - need < 64) newPage(); };
  const drawLine = (ws: Word[], x: number, size: number) => {
    let cx = x;
    const space = regular.widthOfTextAtSize(' ', size);
    for (const w of ws) {
      const f = w.bold ? bold : regular;
      page.drawText(w.text, { x: cx, y, size, font: f, color: INK });
      cx += f.widthOfTextAtSize(w.text, size) + space;
    }
  };

  newPage();
  for (const b of contractBlocks(input.body)) {
    if (b.kind === 'h1') {
      const text = clean(heavy, b.runs.map((r) => r.text).join('')).toUpperCase();
      const lines = layoutRuns([{ text, bold: true }], heavy, heavy, 14, W - 2 * M);
      ensure(lines.length * 20 + 10);
      for (const l of lines) {
        const s = l.map((w) => w.text).join(' ');
        page.drawText(s, { x: (W - heavy.widthOfTextAtSize(s, 14)) / 2, y, size: 14, font: heavy, color: NAVY });
        y -= 20;
      }
      y -= 8;
    } else if (b.kind === 'h2') {
      const lines = layoutRuns(b.runs.map((r) => ({ ...r, bold: true })), regular, bold, 11, W - 2 * M);
      ensure(lines.length * LEAD + 24);
      y -= 6;
      for (const l of lines) { drawLine(l, M, 11); y -= LEAD; }
      y -= 2;
    } else {
      const indent = b.kind === 'li' ? 16 : 0;
      const lines = layoutRuns(b.runs, regular, bold, BODY, W - 2 * M - indent);
      for (const [i, l] of lines.entries()) {
        ensure(LEAD);
        if (b.kind === 'li' && i === 0) page.drawText('•', { x: M + 4, y, size: BODY, font: bold, color: BLUE });
        drawLine(l, M + indent, BODY);
        y -= LEAD;
      }
      y -= 7;
    }
  }

  // Página de assinaturas e evidências (contrato assinado).
  if (input.signers?.length) {
    newPage();
    page.drawText('ASSINATURAS E EVIDÊNCIAS', { x: M, y, size: 15, font: heavy, color: NAVY });
    y -= 18;
    for (const l of layoutRuns([{ text: 'Documento assinado eletronicamente no Nação ADM. Cada parte acessou o contrato por link individual e confirmou a assinatura com um código de uso único enviado ao seu WhatsApp. As partes reconhecem este meio como válido para comprovar a autoria e a integridade do documento (MP 2.200-2/2001, art. 10, § 2º).', bold: false }], regular, bold, 8.5, W - 2 * M)) {
      page.drawText(l.map((w) => w.text).join(' '), { x: M, y, size: 8.5, font: regular, color: SOFT });
      y -= 12;
    }
    y -= 10;
    for (const s of input.signers) {
      ensure(112);
      const top = y;
      page.drawRectangle({ x: M, y: top - 96, width: W - 2 * M, height: 100, borderColor: LINE, borderWidth: 1, color: C.blueBg });
      page.drawRectangle({ x: M, y: top - 96, width: 4, height: 100, color: s.signedAt ? BLUE : C.amber });
      page.drawText(clean(bold, s.name), { x: M + 14, y: top - 16, size: 11.5, font: bold, color: INK });
      const tag = clean(bold, roleLabel(s.role).toUpperCase());
      page.drawText(tag, { x: W - M - 12 - bold.widthOfTextAtSize(tag, 8), y: top - 15, size: 8, font: bold, color: BLUE });
      const rows: [string, string][] = [
        ['Documento', s.document ?? '—'],
        ['Assinado em', s.signedAt ?? 'pendente'],
        ['Nome digitado', s.signedName ?? '—'],
        ['Código enviado para', `WhatsApp ${maskPhone(s.phone)}`],
        ['IP · dispositivo', `${s.ip ?? '—'} · ${shortUa(s.userAgent)}`],
      ];
      let ry = top - 32;
      for (const [k, v] of rows) {
        page.drawText(k, { x: M + 14, y: ry, size: 8.5, font: regular, color: SOFT });
        page.drawText(clean(regular, v).slice(0, 90), { x: M + 120, y: ry, size: 8.5, font: regular, color: INK });
        ry -= 12.5;
      }
      y = top - 112;
    }
    if (input.events?.length) {
      ensure(40);
      page.drawText('Histórico', { x: M, y, size: 10.5, font: bold, color: NAVY });
      y -= 15;
      for (const e of input.events) {
        ensure(12);
        page.drawText(clean(regular, `${e.at} — ${e.text}`).slice(0, 120), { x: M, y, size: 8, font: regular, color: INK });
        y -= 11.5;
      }
    }
  }

  // Rodapé com página x de y, código e o hash do texto (integridade).
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: LINE });
    const left = input.draft ? `MINUTA — não assinada · ${input.code}` : `${input.code}${input.bodyHash ? ` · SHA-256 do texto: ${input.bodyHash}` : ''}`;
    p.drawText(clean(regular, left).slice(0, 110), { x: M, y: 32, size: 6.5, font: input.draft ? bold : regular, color: input.draft ? C.amber : SOFT });
    const right = `página ${i + 1} de ${total} · gerado em ${input.generatedAt}`;
    p.drawText(right, { x: W - M - regular.widthOfTextAtSize(right, 6.5), y: 22, size: 6.5, font: regular, color: SOFT });
  });
  return doc.save();
}
