// Gera src/server/marketing/notice-assets.generated.ts com o escudo e a palavra NAÇÃO em base64.
// Rodar de novo só se trocar a arte: node scripts/embed-notice-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../src/server/marketing/assets/', import.meta.url);
const files = { escudo: 'escudo-comunicado.png', nacao: 'nacao-branco.png' };
let out = '/* Gerado por scripts/embed-notice-assets.mjs — não editar. */\n';
for (const [k, f] of Object.entries(files)) out += `export const ${k} = '${readFileSync(new URL(f, dir)).toString('base64')}';\n`;
writeFileSync(new URL('../src/server/marketing/notice-assets.generated.ts', import.meta.url), out);
console.log('ok', Math.round(out.length / 1024), 'KB');
