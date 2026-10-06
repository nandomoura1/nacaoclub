import QRCode from 'qrcode';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { formatDateBR } from '@/domain/dates';
import { formatBRL, formatPct } from '@/domain/condominio/money';
import { monthLabel, monthLong, type Month } from '@/domain/condominio/months';
import { pixPayload } from '@/domain/condominio/pix';
import type { ChargeLine } from '@/domain/condominio/period';
import { A4, C, LOGO_RATIO, brandDoc, clean, hex, wrap } from '@/server/pdf/kit';

/**
 * Documento de cobrança do Condomínio ("Ajuda de Custo Nação · Prestação de
 * Contas"), A4 retrato, uma página por parceiro. Ordem pensada para quem paga:
 * quanto e até quando (com PIX) → composição da cobrança → rateio → despesas.
 */

export interface ChargeDoc {
  number: number;
  name: string;
  legalName: string | null;
  document: string | null;
  month: Month;
  dueDate: string;
  totalCents: number;
  lines: ChargeLine[];
  allocation: { name: string; headcount: number; cents: number; ratio: number; mine: boolean; snackBar: boolean }[];
  perHeadCents: number;
  headcount: number;
  expenses: { group: string; description: string; amountCents: number }[];
  expensesCents: number;
  payee: { name: string; document: string; pixKey: string | null; pixCity: string; bankInfo: string | null; instructions: string | null };
  emittedAt: string;
}

const W = A4.w;
const H = A4.h;
const M = 28;
const SOFT_BG = hex('#F4F7FB');
const STRIPE = hex('#F8FAFC');

export async function condoChargesPdf(docs: ChargeDoc[]): Promise<Uint8Array> {
  const first = docs[0]!;
  const { doc, regular, bold, heavy, cond, logo } = await brandDoc(docs.length === 1 ? `Ajuda de Custo Nação ${monthLabel(first.month)} · ${first.name}` : `Ajuda de Custo Nação ${monthLabel(first.month)}`);
  for (const d of docs) {
    const page = doc.addPage([W, H]);
    await drawCharge(page, d, { regular, bold, heavy, cond }, logo);
  }
  return doc.save();
}

type Fonts = { regular: PDFFont; bold: PDFFont; heavy: PDFFont; cond: PDFFont };

async function drawCharge(page: PDFPage, d: ChargeDoc, f: Fonts, logo: Awaited<ReturnType<typeof brandDoc>>['logo']) {
  const text = (t: string, x: number, y: number, size: number, font: PDFFont, color: RGB = C.ink) => page.drawText(clean(font, t), { x, y, size, font, color });
  const right = (t: string, xr: number, y: number, size: number, font: PDFFont, color: RGB = C.ink) => {
    const s = clean(font, t);
    page.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y, size, font, color });
  };
  const fit = (t: string, font: PDFFont, size: number, width: number) => {
    let s = clean(font, t);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > width) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };
  const rect = (x: number, y: number, w: number, h: number, color: RGB) => page.drawRectangle({ x, y, width: w, height: h, color });

  // ── Cabeçalho ─────────────────────────────────────────────
  const band = 78;
  rect(0, H - band, W, band, C.navy);
  rect(0, H - band - 4, W, 4, C.blue);
  const lw = 118;
  page.drawImage(logo, { x: M, y: H - band / 2 - (lw * LOGO_RATIO) / 2, width: lw, height: lw * LOGO_RATIO });
  const title = 'AJUDA DE CUSTO NAÇÃO';
  const cx = W / 2 + 6;
  text(title, cx - f.cond.widthOfTextAtSize(clean(f.cond, title), 22) / 2, H - 40, 22, f.cond, C.white);
  const sub = 'PRESTAÇÃO DE CONTAS · CONDOMÍNIO';
  text(sub, cx - f.bold.widthOfTextAtSize(sub, 7.5) / 2, H - 55, 7.5, f.bold, C.pale);
  right(monthLabel(d.month), W - M, H - 44, 28, f.cond, C.white);
  right(`DOCUMENTO Nº ${String(d.number).padStart(4, '0')}`, W - M, H - 59, 7, f.bold, C.pale);

  // ── Para quem ────────────────────────────────────────────
  let y = H - band - 4 - 24;
  text('COBRANÇA PARA', M, y + 8, 7, f.bold, C.soft);
  text(fit(d.name.toUpperCase(), f.heavy, 17, W - 2 * M), M, y - 10, 17, f.heavy, C.navy);
  const who = [d.legalName, d.document].filter(Boolean).join(' · ');
  if (who) text(fit(who, f.regular, 8.5, W - 2 * M), M, y - 23, 8.5, f.regular, C.soft);
  y -= who ? 36 : 26;

  // ── Pagamento ────────────────────────────────────────────
  const boxH = 138;
  const boxY = y - boxH;
  page.drawRectangle({ x: M, y: boxY, width: W - 2 * M, height: boxH, color: C.blueBg, borderColor: C.blue, borderWidth: 1.2 });
  rect(M, boxY, 5, boxH, C.blue);
  const lx = M + 18;
  text('VALOR A PAGAR', lx, y - 22, 8, f.bold, C.soft);
  text(formatBRL(d.totalCents), lx, y - 50, 27, f.heavy, C.navy);
  text('VENCIMENTO', lx, y - 72, 8, f.bold, C.soft);
  text(formatDateBR(d.dueDate), lx, y - 94, 20, f.heavy, C.blue);
  text(fit(`Gastos comuns de ${monthLong(d.month)}`, f.regular, 7.5, 170), lx, y - 110, 7.5, f.regular, C.soft);

  const qr = 104;
  const hasPix = !!d.payee.pixKey;
  const midX = lx + 190;
  const midW = W - M - (hasPix ? qr + 26 : 16) - midX;
  text('COMO PAGAR', midX, y - 22, 8, f.bold, C.soft);
  let my = y - 37;
  const info: [string, PDFFont, number, RGB][] = [];
  info.push([hasPix ? `PIX · chave ${d.payee.pixKey}` : 'Via boleto ou PIX', f.bold, 9.5, C.navy]);
  info.push([d.payee.name, f.regular, 8.5, C.ink]);
  info.push([`CNPJ ${d.payee.document}`, f.regular, 8.5, C.ink]);
  if (d.payee.bankInfo) info.push([d.payee.bankInfo, f.regular, 8, C.ink]);
  if (d.payee.instructions) info.push([d.payee.instructions, f.regular, 8, C.soft]);
  info.push([`Pague até ${formatDateBR(d.dueDate)}.`, f.bold, 8.5, C.blue]);
  for (const [t, font, size, color] of info) {
    for (const l of wrap(t, font, size, midW).slice(0, 2)) {
      if (my < boxY + 10) break;
      text(l, midX, my, size, font, color);
      my -= size + 3.5;
    }
  }
  if (hasPix) {
    const payload = pixPayload({ key: d.payee.pixKey!, name: d.payee.name, city: d.payee.pixCity, amountCents: d.totalCents, txid: `CONDO${d.month.replace('-', '')}N${d.number}` });
    const q = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const n = q.modules.size;
    const qx = W - M - qr - 12;
    const qy = boxY + (boxH - qr) / 2 + 6;
    rect(qx - 4, qy - 4, qr + 8, qr + 8, C.white);
    const cell = qr / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) rect(qx + c * cell, qy + qr - (r + 1) * cell, cell + 0.15, cell + 0.15, C.navy);
    const cap = 'PIX COPIA E COLA';
    text(cap, qx + qr / 2 - f.bold.widthOfTextAtSize(cap, 6.5) / 2, qy - 13, 6.5, f.bold, C.soft);
  }
  y = boxY - 18;

  // ── Colunas ──────────────────────────────────────────────
  const footerTop = 58;
  const gap = 14;
  const leftW = (W - 2 * M - gap) * 0.54;
  const rightX = M + leftW + gap;
  const rightW = W - M - rightX;
  const barH = 17;
  const bar = (label: string, x: number, yy: number, w: number) => {
    rect(x, yy - barH, w, barH, C.navy);
    text(label, x + 7, yy - 12, 8, f.bold, C.white);
    return yy - barH;
  };

  // Esquerda 1: composição da cobrança.
  let ly = bar('COMPOSIÇÃO DA COBRANÇA', M, y, leftW);
  d.lines.forEach((l, i) => {
    const descW = leftW - 90;
    const detail = l.detail ? wrap(l.detail, f.regular, 6.5, descW).slice(0, 2) : [];
    const h = 16 + detail.length * 8.5;
    if (i % 2) rect(M, ly - h, leftW, h, STRIPE);
    text(fit(l.description, f.bold, 8.5, descW), M + 7, ly - 11, 8.5, f.bold, C.ink);
    detail.forEach((t, k) => text(t, M + 7, ly - 20 - k * 8.5, 6.5, f.regular, C.soft));
    right(formatBRL(l.cents), M + leftW - 7, ly - 11, 8.5, f.bold, C.ink);
    ly -= h;
  });
  rect(M, ly - 19, leftW, 19, C.blue);
  text('TOTAL', M + 7, ly - 13, 9, f.heavy, C.white);
  right(formatBRL(d.totalCents), M + leftW - 7, ly - 13, 10, f.heavy, C.white);
  ly -= 19 + 16;

  // Esquerda 2: contribuição individualizada (rateio).
  const availL = ly - barH - 14 - 16 - footerTop;
  const rowL = Math.max(9, Math.min(13, availL / Math.max(1, d.allocation.length)));
  const fsL = Math.min(8, rowL - 3.5);
  ly = bar('CONTRIBUIÇÃO INDIVIDUALIZADA', M, ly, leftW);
  const colA = M + leftW - 150;
  const colV = M + leftW - 52;
  const colP = M + leftW - 7;
  text('Centro de custo', M + 7, ly - 10, 6.5, f.bold, C.soft);
  right('Alunos', colA, ly - 10, 6.5, f.bold, C.soft);
  right('Valor', colV, ly - 10, 6.5, f.bold, C.soft);
  right('%', colP, ly - 10, 6.5, f.bold, C.soft);
  ly -= 14;
  d.allocation.forEach((a, i) => {
    if (a.mine) rect(M, ly - rowL, leftW, rowL, C.blueBg);
    else if (i % 2) rect(M, ly - rowL, leftW, rowL, STRIPE);
    const font = a.mine ? f.heavy : f.regular;
    const color = a.mine ? C.blue : C.ink;
    const base = ly - rowL + (rowL - fsL) / 2 + 1;
    text(fit(`${a.name}${a.snackBar ? ' (fixo)' : ''}`, font, fsL, colA - M - 40), M + 7, base, fsL, font, color);
    right(a.snackBar ? '—' : String(a.headcount), colA, base, fsL, font, color);
    right(formatBRL(a.cents), colV, base, fsL, font, color);
    right(formatPct(a.ratio), colP, base, fsL, font, color);
    ly -= rowL;
  });
  rect(M, ly - 16, leftW, 16, SOFT_BG);
  text(fit(`Total (${formatBRL(d.perHeadCents)}/aluno)`, f.bold, 7.5, colA - M - 30), M + 7, ly - 11, 7.5, f.bold, C.navy);
  right(String(d.headcount), colA, ly - 11, 7.5, f.bold, C.navy);
  right(formatBRL(d.expensesCents), colV, ly - 11, 7.5, f.bold, C.navy);
  right('100%', colP, ly - 11, 7.5, f.bold, C.navy);

  // Direita: despesas comuns do mês (prestação de contas).
  let ry = bar('DESPESAS COMUNS DO MÊS', rightX, y, rightW);
  const groups = [...new Set(d.expenses.map((e) => e.group))];
  const rowsCount = d.expenses.length + groups.length;
  const availR = ry - 22 - footerTop;
  const rowR = Math.max(8.5, Math.min(13, availR / Math.max(1, rowsCount)));
  const fsR = Math.min(8, rowR - 3.2);
  for (const g of groups) {
    rect(rightX, ry - rowR, rightW, rowR, SOFT_BG);
    text(fit(g, f.heavy, fsR, rightW - 14), rightX + 7, ry - rowR + (rowR - fsR) / 2 + 1, fsR, f.heavy, C.navy);
    ry -= rowR;
    d.expenses.filter((e) => e.group === g).forEach((e) => {
      const base = ry - rowR + (rowR - fsR) / 2 + 1;
      text(fit(e.description, f.regular, fsR, rightW - 82), rightX + 11, base, fsR, f.regular, C.ink);
      right(formatBRL(e.amountCents), rightX + rightW - 7, base, fsR, f.regular, C.ink);
      page.drawLine({ start: { x: rightX + 7, y: ry - rowR }, end: { x: rightX + rightW - 7, y: ry - rowR }, thickness: 0.4, color: C.line });
      ry -= rowR;
    });
  }
  rect(rightX, ry - 19, rightW, 19, C.navy);
  text('TOTAL', rightX + 7, ry - 13, 9, f.heavy, C.white);
  right(formatBRL(d.expensesCents), rightX + rightW - 7, ry - 13, 9.5, f.heavy, C.white);

  // ── Rodapé ───────────────────────────────────────────────
  text(fit('Demonstrativo da ajuda de custo dos gastos comuns da Nação. A Lanchonete assume o percentual fixo; o restante é dividido por alunos/colaboradores.', f.regular, 6.5, W - 2 * M), M, 44, 6.5, f.regular, C.soft);
  rect(0, 0, W, 34, C.navy);
  text('Muitos esportes, muitas paixões, uma Nação!', M, 13, 9, f.bold, C.white);
  right(`Emitido em ${formatDateBR(d.emittedAt)} · Nação ADM`, W - M, 13, 7, f.regular, C.pale);
}
