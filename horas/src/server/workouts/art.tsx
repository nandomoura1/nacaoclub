import * as React from 'react'; // o renderizador (tsx/vitest) usa JSX clássico
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import type { ReactNode } from 'react';
import {
  ART_LABEL, KIND, dayName, ddmm, fitFontSize, lines, weekRange,
  type WorkoutBlockData, type WorkoutDayData, type WorkoutWeekData,
} from '@/domain/workout';
import * as A from './assets.generated';

/**
 * Arte de divulgação dos treinos (JPG), no padrão visual da Nação:
 * paleta #022B57 · #0169E9 · #3A86FF · #20C4FA, Barlow Condensed itálico
 * nos títulos e Montserrat no corpo. Fases genéricas numa linha; Força e
 * WOD detalhados. O tamanho da letra se ajusta para nada ficar cortado.
 */

const NAVY = '#022B57';
const DEEP = '#01152E';
const BLUE = '#0169E9';
const SKY = '#3A86FF';
const CYAN = '#20C4FA';
const WHITE = '#FFFFFF';
const SOFT = '#C9DBF7';

const buf = (b64: string) => Buffer.from(b64, 'base64');
const fonts = () => [
  { name: 'Barlow', data: buf(A.barlow600), weight: 600 as const, style: 'italic' as const },
  { name: 'Barlow', data: buf(A.barlow700), weight: 700 as const, style: 'italic' as const },
  { name: 'Barlow', data: buf(A.barlow800), weight: 800 as const, style: 'italic' as const },
  { name: 'Montserrat', data: buf(A.montserrat500), weight: 500 as const, style: 'normal' as const },
  { name: 'Montserrat', data: buf(A.montserrat700), weight: 700 as const, style: 'normal' as const },
  { name: 'Montserrat', data: buf(A.montserrat800), weight: 800 as const, style: 'normal' as const },
];
const logo = `data:image/png;base64,${A.logoBranco}`;
const LOGO_RATIO = 351 / 900;

/** Ondas finas da identidade (elemento "céu de Brasília"). */
function waves(w: number, h: number) {
  const paths = Array.from({ length: 22 }, (_, i) => {
    const y = h * 0.1 + i * (h / 26);
    return `<path d="M0 ${y} C ${w * 0.25} ${y - 60}, ${w * 0.5} ${y + 80}, ${w} ${y - 20}" stroke="${SKY}" stroke-opacity="${0.05 + (i % 3) * 0.02}" stroke-width="2" fill="none"/>`;
  }).join('');
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${paths}</svg>`).toString('base64')}`;
}

function Icon({ name, size, color }: { name: string; size: number; color: string }) {
  const s = { width: size, height: size };
  const p = { stroke: color, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'flame') return <svg viewBox="0 0 24 24" style={s}><path d="M12 2.5c.8 3.2 4.8 5.3 4.8 10a4.8 4.8 0 1 1-9.6 0c0-2.3 1.2-3.6 2.4-4.8.2 2 1.2 3.1 2.4 3.4-.4-3 .2-5.8 0-8.6z" fill={color} /></svg>;
  if (name === 'bar') return <svg viewBox="0 0 24 24" style={s}><path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8" {...p} /></svg>;
  if (name === 'target') return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="9" {...p} /><circle cx="12" cy="12" r="5" {...p} /><circle cx="12" cy="12" r="1.5" fill={color} /></svg>;
  if (name === 'core') return <svg viewBox="0 0 24 24" style={s}><path d="M5 7h14M4 12h16M5 17h14" {...p} /></svg>;
  if (name === 'ball') return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="9" {...p} /><path d="M3.5 9c5 1 12 1 17 0M7 4c3 4 3 12 0 16" {...p} /></svg>;
  return <svg viewBox="0 0 24 24" style={s}><path d="M3 13h4l3-7 4 12 3-7h4" {...p} /></svg>;
}

const dayLabel = (d: string) => {
  const n = dayName(d);
  return ['Sábado', 'Domingo'].includes(n) ? n.toUpperCase() : `${n}-feira`.toUpperCase();
};

function Block({ b, f }: { b: WorkoutBlockData; f: number }) {
  const k = KIND[b.kind];
  const label = ART_LABEL[b.kind] || (b.title ?? '').toUpperCase();
  if (!k.detailed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: f * 0.55, paddingBottom: f * 0.35, marginBottom: f * 0.35, borderBottom: `1px solid ${SKY}40` }}>
        <Icon name={k.icon} size={f * 1.35} color={SKY} />
        <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 700, fontStyle: 'italic', fontSize: f * 1.35, color: SKY, letterSpacing: 0.5 }}>
          {label}
          {b.durationMin ? <span style={{ color: WHITE, marginLeft: f * 0.4 }}>{`— ${b.durationMin}'`}</span> : null}
        </div>
      </div>
    );
  }
  const body = lines(b.content);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: f * 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: f * 0.55 }}>
        <Icon name={k.icon} size={f * 1.5} color={b.kind === 'WOD' ? BLUE : SKY} />
        <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: f * 1.5, color: SKY, letterSpacing: 0.5 }}>
          {label}
          {b.durationMin ? <span style={{ color: WHITE, marginLeft: f * 0.45 }}>{`${b.durationMin}'`}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: f * 2.05 }}>
        {b.title && ART_LABEL[b.kind] ? <div style={{ fontFamily: 'Montserrat', fontWeight: 800, fontSize: f * 1.02, color: WHITE, textTransform: 'uppercase' }}>{b.title}</div> : null}
        {b.format ? <div style={{ fontFamily: 'Montserrat', fontWeight: 700, fontSize: f, color: SOFT }}>{b.format}</div> : null}
        {body.map((l, i) => (
          <div key={i} style={{ fontFamily: 'Montserrat', fontWeight: 500, fontSize: f, color: WHITE, lineHeight: 1.25 }}>{l}</div>
        ))}
        {b.notes ? <div style={{ fontFamily: 'Montserrat', fontWeight: 500, fontSize: f * 0.85, color: SOFT, marginTop: 2 }}>{b.notes}</div> : null}
        {b.timeCapMin ? (
          <div style={{ display: 'flex', alignSelf: 'flex-start', marginTop: f * 0.35, background: CYAN, color: NAVY, fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: f * 1.05, padding: `${f * 0.1}px ${f * 0.6}px` }}>
            {`TIME CAP — ${b.timeCapMin}'`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DayColumn({ d, f, showHeader = true }: { d: WorkoutDayData; f: number; showHeader?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, border: `1.5px solid ${BLUE}99`, background: 'rgba(1,14,34,0.82)' }}>
      {showHeader ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: `linear-gradient(180deg, ${BLUE}, #0a3f9e)`, padding: '10px 6px 8px' }}>
          <div style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: f * 1.7, color: WHITE, lineHeight: 1 }}>{dayLabel(d.date)}</div>
          <div style={{ fontFamily: 'Barlow', fontWeight: 700, fontStyle: 'italic', fontSize: f * 1.45, color: WHITE, lineHeight: 1.05 }}>{`${ddmm(d.date)}${d.title ? ` · ${d.title.toUpperCase()}` : ''}`}</div>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', padding: `${f * 0.8}px ${f * 0.75}px` }}>
        {d.blocks.map((b, i) => <Block key={i} b={b} f={f} />)}
      </div>
    </div>
  );
}

function Footer({ week, height }: { week: WorkoutWeekData; height: number }) {
  const chips = lines(week.footerChips).map((l) => { const [a, ...r] = l.split('|'); return { label: a!.trim(), value: r.join('|').trim() }; });
  const hasAd = Boolean(week.footerTitle || week.footerText || chips.length);
  return (
    <div style={{ display: 'flex', alignItems: 'center', height, minHeight: height, maxHeight: height, flexShrink: 0, overflow: 'hidden', borderTop: `3px solid ${BLUE}`, background: 'rgba(1,12,30,0.92)', padding: '0 40px', gap: 28 }}>
      {hasAd ? (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 28, height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            {week.footerTitle ? <div style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.36, color: WHITE, lineHeight: 1 }}>{week.footerTitle.toUpperCase()}</div> : null}
            {week.footerText ? <div style={{ fontFamily: 'Montserrat', fontWeight: 500, fontSize: height * 0.12, color: SOFT, marginTop: 6, lineHeight: 1.3 }}>{week.footerText}</div> : null}
          </div>
          {chips.slice(0, 4).map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, height: height * 0.72, border: `2px solid ${SKY}`, background: `linear-gradient(180deg, ${NAVY}, ${DEEP})`, padding: '0 22px', minWidth: 170 }}>
              <div style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.17, color: WHITE, textAlign: 'center' }}>{c.label.toUpperCase()}</div>
              {c.value ? <div style={{ display: 'flex', marginTop: 6, background: BLUE, padding: '2px 14px', fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.2, color: WHITE }}>{c.value.toUpperCase()}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.3, color: WHITE }}>
            MUITOS ESPORTES, MUITAS PAIXÕES,<span style={{ color: CYAN, marginLeft: 14 }}>UMA NAÇÃO!</span>
          </div>
          <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 700, fontStyle: 'italic', fontSize: height * 0.2, color: SOFT }}>DISCIPLINA · FOCO · EVOLUÇÃO · COMUNIDADE</div>
        </div>
      )}
    </div>
  );
}

function Header({ week, height, subtitle }: { week: WorkoutWeekData; height: number; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height, padding: '0 40px', gap: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 26, width: '31%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={height * 1.2} height={height * 1.2 * LOGO_RATIO} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `2px solid ${SOFT}66`, paddingLeft: 18, fontFamily: 'Barlow', fontWeight: 600, fontStyle: 'italic', fontSize: height * 0.12, color: WHITE, lineHeight: 1.05 }}>
          <span>MUITOS ESPORTES,</span><span>MUITAS PAIXÕES,</span><span style={{ color: CYAN, fontWeight: 800 }}>UMA NAÇÃO!</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        <div style={{ fontFamily: 'Barlow', fontWeight: 600, fontStyle: 'italic', fontSize: height * 0.13, color: WHITE, letterSpacing: 6 }}>{subtitle}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginTop: -4 }}>
          <span style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.4, color: WHITE, lineHeight: 1 }}>TREINOS</span>
          <span style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.4, color: BLUE, lineHeight: 1 }}>{week.modality.toUpperCase()}</span>
        </div>
        <div style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: height * 0.16, color: WHITE, marginTop: 2 }}>{weekRange(week)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '22%', fontFamily: 'Barlow', fontWeight: 700, fontStyle: 'italic', fontSize: height * 0.13, color: WHITE, lineHeight: 1.05 }}>
        <span>MAIS QUE</span><span>TREINO.</span><span style={{ color: CYAN, fontWeight: 800 }}>É NAÇÃO.</span>
      </div>
    </div>
  );
}

function Canvas({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, background: `linear-gradient(160deg, ${NAVY} 0%, ${DEEP} 55%, #000814 100%)`, position: 'relative' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={waves(w, h)} width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />
      {children}
    </div>
  );
}

async function toJpg(el: React.ReactElement, w: number, h: number): Promise<Buffer> {
  const png = Buffer.from(await new ImageResponse(el, { width: w, height: h, fonts: fonts() }).arrayBuffer());
  return sharp(png).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
}

/** Paisagem: a semana inteira, um dia por coluna. */
export async function weekArt(week: WorkoutWeekData): Promise<Buffer> {
  const W = 1920; const H = 1280; const HEAD = 250; const FOOT = 170;
  const days = week.days.filter((d) => d.blocks.length).sort((a, b) => a.date.localeCompare(b.date));
  const cols = Math.max(days.length, 1);
  const colW = (W - 60 - (cols - 1) * 14) / cols;
  const f = fitFontSize(days, { columnWidth: colW - 40, height: H - HEAD - FOOT - 120, max: 22, min: 11 });
  return toJpg(
    <Canvas w={W} h={H}>
      <Header week={week} height={HEAD} subtitle="PLANO SEMANAL DE" />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', gap: 14, padding: '0 30px 20px' }}>
        {days.map((d) => <DayColumn key={d.date} d={d} f={f} />)}
      </div>
      <Footer week={week} height={FOOT} />
    </Canvas>,
    W, H,
  );
}

/** Retrato (4:5): só o treino do dia, em letras grandes. */
export async function dayArt(week: WorkoutWeekData, date: string): Promise<Buffer> {
  const W = 1080; const H = 1350; const FOOT = 150;
  const day = week.days.find((d) => d.date === date);
  if (!day) throw new Error('Dia sem treino.');
  const f = fitFontSize([day], { columnWidth: W - 160, height: H - 330 - FOOT - 80, max: 34, min: 14 });
  return toJpg(
    <Canvas w={W} h={H}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '40px 50px 10px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={320} height={320 * LOGO_RATIO} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontFamily: 'Barlow', fontWeight: 600, fontStyle: 'italic', fontSize: 34, color: WHITE, letterSpacing: 5 }}>TREINO DO DIA</div>
          <div style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: 92, color: BLUE, lineHeight: 0.95 }}>{week.modality.toUpperCase()}</div>
        </div>
      </div>
      <div style={{ display: 'flex', margin: '6px 50px 18px', background: `linear-gradient(90deg, ${BLUE}, #0a3f9e)`, padding: '10px 22px', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: 46, color: WHITE }}>{dayLabel(date)}</span>
        <span style={{ fontFamily: 'Barlow', fontWeight: 800, fontStyle: 'italic', fontSize: 46, color: WHITE }}>{`${ddmm(date)}${day.title ? ` · ${day.title.toUpperCase()}` : ''}`}</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 50px 24px' }}>
        <DayColumn d={day} f={f} showHeader={false} />
      </div>
      <Footer week={week} height={FOOT} />
    </Canvas>,
    W, H,
  );
}
