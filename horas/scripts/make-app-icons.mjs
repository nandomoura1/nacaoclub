// Gera favicon, ícone da tela inicial (PWA/iOS) e o escudo da marca a partir
// da logo oficial (src/server/workouts/assets/logo-*.png). Rodar de novo se a logo mudar:
//   node scripts/make-app-icons.mjs
import { mkdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';

const NAVY = '#022B57';
const src = (f) => `src/server/workouts/assets/${f}.png`;
// O escudo ocupa a faixa esquerda da logo (900×351).
const shield = async (f) => sharp(await sharp(src(f)).extract({ left: 0, top: 0, width: 282, height: 351 }).png().toBuffer()).trim().png().toBuffer();

/** Escudo centralizado num quadrado: `scale` = altura do escudo / lado. */
async function square(shieldPng, size, scale, background) {
  const h = Math.round(size * scale);
  const s = await sharp(shieldPng).resize({ height: h }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: s, gravity: 'center' }])
    .png()
    .toBuffer();
}

const cor = await shield('logo-cor');
const branco = await shield('logo-branco');
mkdirSync('public/icons', { recursive: true });
mkdirSync('public/brand', { recursive: true });
rmSync('src/app/icon.svg', { force: true });

await sharp(await square(branco, 96, 0.8, NAVY)).toFile('src/app/icon.png'); // aba do navegador (fundo navy: legível no tema claro e escuro)
await sharp(await square(branco, 180, 0.72, NAVY)).toFile('src/app/apple-icon.png'); // iPhone "Adicionar à Tela de Início"
await sharp(await square(branco, 192, 0.72, NAVY)).toFile('public/icons/icon-192.png');
await sharp(await square(branco, 512, 0.72, NAVY)).toFile('public/icons/icon-512.png');
await sharp(await square(branco, 512, 0.56, NAVY)).toFile('public/icons/icon-maskable-512.png'); // Android recorta em círculo
await sharp(branco).resize({ height: 96 }).png().toFile('public/brand/escudo-branco.png'); // cabeçalho/menu (fundo escuro)
await sharp(cor).resize({ height: 96 }).png().toFile('public/brand/escudo-cor.png'); // impressão (fundo claro)
rmSync('public/brand/escudo.png', { force: true });
console.log('ícones gerados');
