// Gera src/server/workouts/assets.generated.ts com fontes e logos em base64.
// Embutidos no código: a geração da arte nunca depende de arquivo solto no servidor.
// Rodar de novo só se trocar logo ou fonte: node scripts/embed-workout-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../src/server/workouts/assets/', import.meta.url);
const files = {
  barlow600: 'barlow-condensed-latin-600-italic.woff',
  barlow700: 'barlow-condensed-latin-700-italic.woff',
  barlow800: 'barlow-condensed-latin-800-italic.woff',
  montserrat500: 'montserrat-latin-500-normal.woff',
  montserrat700: 'montserrat-latin-700-normal.woff',
  montserrat800: 'montserrat-latin-800-normal.woff',
  logoBranco: 'logo-branco.png',
  logoCor: 'logo-cor.png',
};
let out = '/* Gerado por scripts/embed-workout-assets.mjs — não editar. Fontes: SIL OFL (ver assets/OFL-*.txt). */\n';
for (const [k, f] of Object.entries(files)) out += `export const ${k} = '${readFileSync(new URL(f, dir)).toString('base64')}';\n`;
writeFileSync(new URL('../src/server/workouts/assets.generated.ts', import.meta.url), out);
console.log('ok', Math.round(out.length / 1024), 'KB');
