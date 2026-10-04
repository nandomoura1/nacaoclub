import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import {
  ART_LABEL, KIND, dayMinutes, lessonMinutes, dayName, ddmm, lessonTimeline, lines, studentBlock, weekRange,
  type WorkoutBlockData, type WorkoutDayData, type WorkoutWeekData,
} from '@/domain/workout';
import { A4, C, LOGO_RATIO, brandDoc, clean, wrap } from '@/server/pdf/kit';

/**
 * PDFs dos treinos (A4 retrato):
 *  - professor: plano de aula completo, um dia por página, linha do tempo da
 *    aula, roteiro de todas as etapas e as orientações ao professor;
 *  - aluno: resumo da semana, fases genéricas só com o tempo e força, técnica
 *    e WOD detalhados. Orientações ao professor nunca entram.
 */
export type WorkoutPdfMode = 'professor' | 'aluno';

const { w: W, h: H, m: M } = A4;
const dayHeader = (d: string) => {
  const n = dayName(d);
  return (['Sábado', 'Domingo'].includes(n) ? n : `${n}-feira`).toUpperCase();
};
const bullet = (l: string) => l.replace(/^[-•*]\s*/, '');

export async function workoutPdf(week: WorkoutWeekData, mode: WorkoutPdfMode, onlyDate?: string): Promise<Uint8Array> {
  const days = week.days
    .filter((d) => d.blocks.length && (!onlyDate || d.date === onlyDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => (mode === 'aluno' ? { ...d, blocks: d.blocks.map(studentBlock) } : d));
  const teacher = mode === 'professor';
  const kicker = teacher ? 'PLANO DE AULA' : onlyDate ? 'TREINO DO DIA' : 'TREINOS DA SEMANA';
  const range = onlyDate ? `${dayHeader(onlyDate)} · ${ddmm(onlyDate)}` : weekRange({ ...week, days });
  const { doc, regular, bold, heavy, cond, logo } = await brandDoc(`${kicker} · ${week.modality} · ${range}`);

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;
  const text = (t: string, x: number, yy: number, size: number, font: PDFFont, color: RGB) =>
    page.drawText(clean(font, t), { x, y: yy, size, font, color });

  const newPage = (big: boolean) => {
    page = doc.addPage([W, H]);
    pageNo += 1;
    const band = big ? 96 : 44;
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: C.navy });
    page.drawRectangle({ x: 0, y: H - band - 4, width: W, height: 4, color: C.blue });
    if (big) {
      const lw = 150;
      page.drawImage(logo, { x: M, y: H - 48 - (lw * LOGO_RATIO) / 2, width: lw, height: lw * LOGO_RATIO });
      const k = clean(cond, kicker);
      text(k, W - M - cond.widthOfTextAtSize(k, 15), H - 34, 15, cond, C.pale);
      const mod = clean(cond, week.modality.toUpperCase());
      const size = Math.min(34, (W - 2 * M - 180) / Math.max(1, cond.widthOfTextAtSize(mod, 1)));
      text(mod, W - M - cond.widthOfTextAtSize(mod, size), H - 66, size, cond, C.white);
      const r = clean(heavy, range);
      text(r, W - M - heavy.widthOfTextAtSize(r, 10), H - 84, 10, heavy, C.pale);
    } else {
      text(`${kicker} · ${week.modality.toUpperCase()} · ${range}`, M, H - 28, 13, cond, C.white);
    }
    text(teacher ? 'Uso interno: orientações para a equipe de professores.' : 'Muitos esportes, muitas paixões, uma Nação!', M, 22, 8, bold, teacher ? C.soft : C.blue);
    const foot = `página ${pageNo}`;
    text(foot, W - M - regular.widthOfTextAtSize(foot, 8), 22, 8, regular, C.soft);
    y = H - band - 30;
  };
  const ensure = (need: number) => { if (y - need < 50) newPage(false); };

  const X = teacher ? M + 64 : M + 12; // texto dos blocos (no professor, à direita da linha do tempo)
  const TW = W - M - X;

  const dayBar = (d: WorkoutDayData) => {
    ensure(60);
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 26, color: C.blue });
    text(`${dayHeader(d.date)} · ${ddmm(d.date)}${d.title ? ` — ${d.title.toUpperCase()}` : ''}`, M + 10, y, 15, cond, C.white);
    const total = dayMinutes(d);
    if (total) {
      const ref = teacher ? lessonMinutes(week.modality) : null;
      const t = clean(heavy, `${teacher ? 'AULA DE ' : ''}${total}'${ref && ref !== total ? ` / REF. ${ref}'` : ''}`);
      text(t, W - M - 10 - heavy.widthOfTextAtSize(t, 10), y + 1, 10, heavy, C.white);
    }
    y -= 34;
  };

  /** Bloco de texto com quebra e página nova quando precisa. */
  const para = (t: string, font: PDFFont, size: number, color: RGB, x = X, width = TW, lead = size * 1.35) => {
    for (const l of wrap(t, font, size, width)) { ensure(lead); text(l, x, y, size, font, color); y -= lead; }
  };

  const block = (b: WorkoutBlockData, from: number, to: number | null) => {
    const k = KIND[b.kind];
    const label = ART_LABEL[b.kind] || (b.title?.toUpperCase() ?? 'BLOCO');
    const titled = b.title && ART_LABEL[b.kind];
    const content = lines(b.content);
    const summaryOnly = !teacher && !k.detailed;
    ensure(summaryOnly ? 18 : 40);

    if (teacher) text(to === null ? `${from}'` : `${from}'–${to}'`, M + 4, y, 10.5, heavy, C.blue);
    const head = `${label}${b.durationMin ? ` ${b.durationMin}'` : ''}`;
    text(head, X, y - 1, summaryOnly ? 13 : 15, cond, summaryOnly ? C.soft : C.navy);
    if (titled) text(`· ${b.title}`, X + cond.widthOfTextAtSize(clean(cond, head), 15) + 6, y, 11, bold, C.ink);
    y -= summaryOnly ? 16 : 18;
    if (summaryOnly) return;

    const meta = [b.format, b.timeCapMin ? `Time cap ${b.timeCapMin}'` : null].filter(Boolean).join(' · ');
    if (meta) para(meta, bold, 10, C.blue);
    for (const l of content) {
      const w = wrap(bullet(l), regular, 10.5, TW - 12);
      ensure(w.length * 14);
      page.drawCircle({ x: X + 3, y: y + 3.5, size: 1.6, color: C.ink });
      for (const part of w) { text(part, X + 12, y, 10.5, regular, C.ink); y -= 14; }
    }
    if (b.notes) para(b.notes, regular, 9, C.soft);

    if (teacher && b.coachNotes) {
      const noteLines = lines(b.coachNotes).flatMap((l) => wrap(l, regular, 9.5, TW - 20));
      const h = 16 + noteLines.length * 12.5 + 6;
      ensure(h + 4);
      y -= 2;
      page.drawRectangle({ x: X, y: y - h + 10, width: TW, height: h, color: C.amberBg });
      page.drawRectangle({ x: X, y: y - h + 10, width: 3, height: h, color: C.amber });
      text('ORIENTAÇÃO AO PROFESSOR', X + 10, y - 2, 8, heavy, C.amber);
      y -= 15;
      for (const l of noteLines) { text(l, X + 10, y - 2, 9.5, regular, C.ink); y -= 12.5; }
      y -= 8;
    }
    y -= 4;
    page.drawLine({ start: { x: X, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: C.line });
    y -= 8;
  };

  if (!days.length) {
    newPage(true);
    text('Nenhum treino lançado para este período.', M, y, 12, regular, C.soft);
    return doc.save();
  }

  days.forEach((d, i) => {
    if (teacher || i === 0) newPage(i === 0 || teacher);
    else y -= 8;
    if (week.theme && (teacher || i === 0)) { text(`INTENÇÃO: ${week.theme.toUpperCase()}`, M, y, 12, cond, C.blue); y -= 22; }
    dayBar(d);
    if (teacher) for (const { block: b, from, to } of lessonTimeline(d)) block(b, from, to);
    else for (const b of d.blocks) block(b, 0, null);
  });

  // Rodapé de novidade (só para os alunos).
  if (!teacher && (week.footerTitle || week.footerText)) {
    const body = week.footerText ? wrap(week.footerText, regular, 10, W - 2 * M - 24) : [];
    const h = 20 + body.length * 13 + (week.footerTitle ? 18 : 0);
    ensure(h + 10);
    y -= 6;
    page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: C.blueBg });
    if (week.footerTitle) { text(week.footerTitle.toUpperCase(), M + 12, y - 4, 14, cond, C.blue); y -= 18; }
    for (const l of body) { text(l, M + 12, y - 4, 10, regular, C.ink); y -= 13; }
  }
  return doc.save();
}
