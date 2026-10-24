import * as React from 'react'; // o renderizador (tsx/vitest) usa JSX clássico
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { fitText, noticeTheme, splitClosing, NOTICE_ART_FORMATS, type NoticeArtInput } from '@/domain/marketing/notice-art';
import * as W from '@/server/workouts/assets.generated';
import * as A from './notice-assets.generated';

/**
 * Criativo de comunicado no padrão Nação (story "Horário de funcionamento"):
 * fundo escuro (foto opcional escurecida), escudo, título em duas linhas,
 * faixa espaçada com data/motivo, linhas horário × local com selo opcional,
 * frase final em itálico e a palavra NAÇÃO no rodapé.
 */

const WHITE = '#FFFFFF';

const buf = (b64: string) => Buffer.from(b64, 'base64');
const fonts = () => [
  { name: 'Montserrat', data: buf(W.montserrat500), weight: 500 as const, style: 'normal' as const },
  { name: 'Montserrat', data: buf(W.montserrat700), weight: 700 as const, style: 'normal' as const },
  { name: 'Montserrat', data: buf(W.montserrat800), weight: 800 as const, style: 'normal' as const },
];
const SHIELD_RATIO = 672 / 864;
const WORD_RATIO = 600 / 205;

/** Medidas por formato (story é a referência do criativo anexo). */
function layout(format: NoticeArtInput['format'], rows: number) {
  if (format === 'feed') {
    const top = 460, avail = 520;
    const rowH = Math.min(124, Math.floor(avail / rows));
    return { barH: 44, shieldTop: 80, shieldH: 100, titleTop: 215, titleS: 58, titleB: 66, subTop: 365, subS: 34, tableTop: top, rowH, tableX: 90, tableW: 900, timeW: 210, rowFont: Math.min(40, rowH * 0.32), wordH: 54, wordBottom: 72 };
  }
  const top = rows > 3 ? 760 : 802, avail = 3 * 166 + (rows > 3 ? 260 : 0);
  const rowH = Math.min(166, Math.floor(avail / rows));
  return { barH: 64, shieldTop: 125, shieldH: 133, titleTop: 400, titleS: 72, titleB: 74, subTop: 588, subS: 46, tableTop: top, rowH, tableX: 87, tableW: 910, timeW: 220, rowFont: Math.min(46, rowH * 0.28), wordH: 76, wordBottom: 150 };
}

/**
 * Fundo: a foto (padrão = foto aérea da Nação) aparece só `opacity` sobre o
 * cinza-escuro do criativo — o texto precisa ler bem. Já sai misturada (JPEG).
 */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** Clareia (+) ou escurece (−) uma cor hex. */
function shade(hex: string, k: number) {
  return `rgb(${rgb(hex).map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))).join(',')})`;
}

async function background(photo: Buffer | null, opacity: number, w: number, h: number, color: string): Promise<string | null> {
  if (!photo || opacity <= 0) return null;
  try {
    const [r, g, b] = rgb(color);
    const veil = await sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 - opacity } } }).png().toBuffer();
    const img = await sharp(photo).rotate().resize(w, h, { fit: 'cover' }).composite([{ input: veil }]).jpeg({ quality: 84 }).toBuffer();
    return `data:image/jpeg;base64,${img.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Palavra NAÇÃO na cor do tema (o arquivo é branco; recolore pela transparência). */
async function wordmark(color: string): Promise<string> {
  if (color.toUpperCase() === WHITE) return A.nacao;
  const src = buf(A.nacao);
  const { width = 600, height = 205 } = await sharp(src).metadata();
  const out = await sharp({ create: { width, height, channels: 4, background: color } }).composite([{ input: src, blend: 'dest-in' }]).png().toBuffer();
  return out.toString('base64');
}

export async function renderNoticeArt(v: NoticeArtInput, photo: Buffer | null): Promise<Buffer> {
  const f = NOTICE_ART_FORMATS.find((x) => x.id === v.format)!;
  const { width, height } = f;
  const L = layout(v.format, v.rows.length);
  const source = v.background === 'nenhuma' ? null : v.background === 'propria' ? photo : buf(A.fundo);
  const T = noticeTheme(v.theme);
  const ACCENT = T.accent, DARK = T.bg, INK = T.text;
  const bg = await background(source, v.photoOpacity, width, height, T.bg);
  const word = await wordmark(T.text);
  // Escudo: no tema original o miolo é transparente; nos do manual, miolo cinza-escuro (fica legível no claro).
  const shield = T.id === 'original' ? A.escudo : A.escudoSolido;
  const tableH = L.rowH * v.rows.length;
  // Frase final no meio do espaço entre a tabela e a palavra NAÇÃO.
  const wordTop = height - L.wordBottom - L.wordH;
  const closingTop = Math.round((L.tableTop + tableH + wordTop) / 2) - (v.format === 'feed' ? 28 : 40);
  const [light, bold] = splitClosing(v.closing.toUpperCase());
  const placeW = L.tableW - L.timeW - 40;
  const border = 8;

  const el = (
    <div style={{ width, height, display: 'flex', position: 'relative', background: DARK, fontFamily: 'Montserrat', color: INK }}>
      {bg && <img src={bg} width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, width, height }} />}
      {!bg && <div style={{ position: 'absolute', left: 0, top: 0, width, height, display: 'flex', background: `linear-gradient(180deg, ${shade(DARK, 0.04)} 0%, ${shade(DARK, -0.1)} 55%, ${shade(DARK, 0.01)} 100%)` }} />}
      {/* Barra do topo (como nos stories da Nação) */}
      <div style={{ position: 'absolute', left: 0, top: 0, width, height: L.barH, display: 'flex' }}>
        <div style={{ width: Math.round(width * 0.535), height: L.barH, background: ACCENT }} />
        <div style={{ flex: 1, height: L.barH, background: T.bar2 }} />
      </div>
      <img src={`data:image/png;base64,${shield}`} width={Math.round(L.shieldH * SHIELD_RATIO)} height={L.shieldH}
        style={{ position: 'absolute', top: L.shieldTop, left: Math.round((width - L.shieldH * SHIELD_RATIO) / 2) }} />
      {/* Título */}
      <div style={{ position: 'absolute', top: L.titleTop, left: 0, width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {v.titleTop && <div style={{ fontSize: fitText(v.titleTop.toUpperCase(), width - 160, L.titleS, 36), fontWeight: 500, letterSpacing: 2, lineHeight: 1.05 }}>{v.titleTop.toUpperCase()}</div>}
        <div style={{ fontSize: fitText(v.titleBottom.toUpperCase(), width - 160, L.titleB, 40, 0.74), fontWeight: 800, letterSpacing: 1, lineHeight: 1.05 }}>{v.titleBottom.toUpperCase()}</div>
      </div>
      {v.subtitle && (
        <div style={{ position: 'absolute', top: L.subTop, left: 0, width, display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: fitText(v.subtitle, width - 140, L.subS, 24, 1.15), fontWeight: 500, letterSpacing: Math.round(L.subS * 0.42) }}>{v.subtitle.toUpperCase()}</div>
        </div>
      )}
      {/* Tabela horário × local */}
      <div style={{ position: 'absolute', top: L.tableTop, left: L.tableX, width: L.tableW, height: tableH, display: 'flex' }}>
        <div style={{ width: L.timeW, height: tableH, background: ACCENT, display: 'flex', flexDirection: 'column' }}>
          {v.rows.map((r, i) => (
            <div key={i} style={{ height: L.rowH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fitText(r.time, L.timeW - 20, L.rowFont, 22, 0.55), fontWeight: 800, color: WHITE }}>{r.time}</div>
          ))}
        </div>
        <div style={{ flex: 1, height: tableH, display: 'flex', flexDirection: 'column', borderTop: `${border}px solid ${INK}`, borderRight: `${border}px solid ${INK}`, borderBottom: `${border}px solid ${INK}` }}>
          {v.rows.map((r, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: i ? `${border + 2}px solid ${INK}` : 'none', fontSize: fitText(r.place.toUpperCase(), placeW, L.rowFont, 22, 0.72), fontWeight: 800, letterSpacing: 1 }}>
              {r.place.toUpperCase()}
            </div>
          ))}
        </div>
        {/* Selos (ex.: preço), no canto de baixo de cada linha */}
        {v.rows.map((r, i) => r.badge ? (
          <div key={`b${i}`} style={{ position: 'absolute', right: 32, top: L.rowH * (i + 1) - Math.round(L.rowH * 0.22), height: Math.round(L.rowH * 0.38), padding: `0 ${Math.round(L.rowH * 0.18)}px`, borderRadius: 999, background: ACCENT, display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: Math.round(L.rowH * 0.26), fontWeight: 500, color: WHITE, transform: 'skewX(-12deg)' }}>{r.badge}</div>
          </div>
        ) : null)}
      </div>
      {/* Frase final */}
      {(light || bold) && (
        <div style={{ position: 'absolute', top: closingTop, left: 0, width, display: 'flex', justifyContent: 'center', alignItems: 'baseline', fontSize: fitText(v.closing, width - 200, v.format === 'feed' ? 46 : 52, 30, 0.9), letterSpacing: 6, transform: 'skewX(-12deg)' }}>
          {light && <div style={{ fontWeight: 500, marginRight: 22 }}>{light}</div>}
          <div style={{ fontWeight: 800 }}>{bold}</div>
        </div>
      )}
      <img src={`data:image/png;base64,${word}`} width={Math.round(L.wordH * WORD_RATIO)} height={L.wordH}
        style={{ position: 'absolute', bottom: L.wordBottom, left: Math.round((width - L.wordH * WORD_RATIO) / 2) }} />
    </div>
  );
  const png = await new ImageResponse(el, { width, height, fonts: fonts() }).arrayBuffer();
  return Buffer.from(png);
}
