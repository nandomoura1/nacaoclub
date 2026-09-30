// Junta data/historico-<modalidade>/*.txt num módulo TS (o app lê sem acessar o disco).
//   node scripts/embed-history.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
const MODALITIES = ['crossfit', 'funcional', 'hyrox'];
let out = '// Gerado por scripts/embed-history.mjs — não editar à mão.\n';
for (const m of MODALITIES) {
  const dir = `data/historico-${m}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.txt')).sort() : [];
  const text = files.map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
  out += `// ${dir}/*.txt (${files.length} arquivos)\nexport const ${m.toUpperCase()}_HISTORY = ${JSON.stringify(text)};\n`;
  console.log(`${m}: ${files.length} arquivos, ${text.length} caracteres`);
}
writeFileSync('src/domain/programming/history.generated.ts', out);
