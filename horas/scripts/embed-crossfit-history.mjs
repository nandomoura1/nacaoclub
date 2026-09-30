// Junta data/historico-crossfit/*.txt num módulo TS (o app lê sem acessar o disco).
//   node scripts/embed-crossfit-history.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'data/historico-crossfit';
const files = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
const text = files.map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
writeFileSync('src/domain/programming/history.generated.ts',
  `// Gerado por scripts/embed-crossfit-history.mjs — não editar à mão.\n// Fonte: ${dir}/*.txt (${files.length} arquivos)\nexport const CROSSFIT_HISTORY = ${JSON.stringify(text)};\n`);
console.log(`${files.length} arquivos, ${text.length} caracteres`);
