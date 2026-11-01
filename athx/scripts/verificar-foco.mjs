/**
 * VERIFICA SE OS FORMULÁRIOS EM JANELA SEGURAM O FOCO.
 *
 * Por que este arquivo existe: o Modal tinha `onClose` na lista de
 * dependências do efeito que gerencia foco e tecla Escape. Como quem usa o
 * Modal escreve `onClose={() => setForm(null)}` — função nova a cada
 * renderização — o efeito refazia o ciclo inteiro a cada render: devolvia o
 * foco ao elemento anterior na limpeza e o jogava no painel ao reentrar.
 *
 * Como todo campo é controlado, cada TECLA é uma renderização. O cursor
 * pulava do campo a cada letra, e só a primeira entrava. A organização
 * encontrou isso usando o sistema, não um teste.
 *
 * Não está na suíte do vitest porque exigiria jsdom e testing-library só
 * para este caso. Rode à mão quando mexer no Modal ou em qualquer efeito
 * que dependa de uma função vinda por propriedade:
 *
 *   npm run build && npm run start           (noutro terminal, modo demo)
 *   node scripts/verificar-foco.mjs
 *
 * Precisa do Playwright disponível no ambiente.
 */

/**
 * O Playwright pode estar no projeto ou instalado globalmente no ambiente.
 * PLAYWRIGHT_PATH aponta para a instalação quando ela não é resolvível a
 * partir daqui.
 */
async function carregarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean);
  for (const alvo of candidatos) {
    try {
      const mod = await import(alvo);
      return mod.chromium ?? mod.default?.chromium;
    } catch {
      /* tenta o próximo */
    }
  }
  console.error(
    'Playwright não encontrado. Instale no projeto, ou aponte PLAYWRIGHT_PATH\n' +
      'para a instalação — por exemplo:\n' +
      '  PLAYWRIGHT_PATH=/opt/node-tools/node_modules/playwright/index.js node scripts/verificar-foco.mjs',
  );
  process.exit(2);
}

const chromium = await carregarPlaywright();

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const CASOS = [
  ['Duplas', '/admin/teams', 'Nova dupla', 'Nome da dupla', 'Cerrado Norte'],
  ['Eventos', '/admin/eventos', 'Novo evento', 'Nome do evento', 'Etapa Marco'],
  ['Equipe', '/admin/equipe', 'Autorizar', 'E-mail', 'juiz@nacaoclub.com.br'],
  ['WODs', '/admin/wods', 'Novo WOD', 'Nome', 'ENDURANCE EXTRA'],
];

const navegador = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
});

let falhou = false;

for (const [nome, caminho, abrir, rotulo, texto] of CASOS) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  // Nada sai desta máquina durante a verificação.
  await p.route('**', (r) =>
    new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort(),
  );

  await p.goto(BASE + caminho, { waitUntil: 'networkidle' });
  await p.locator('main button', { hasText: abrir }).first().click();
  await p.waitForTimeout(300);

  const campo = p.getByLabel(rotulo).first();
  await campo.click();
  await p.keyboard.type(texto, { delay: 40 });

  const valor = await campo.inputValue();
  const comFoco = await campo.evaluate((el) => el === document.activeElement);
  const ok = valor === texto && comFoco;
  if (!ok) falhou = true;

  console.log(
    `${ok ? 'OK    ' : 'FALHOU'} ${nome.padEnd(10)} digitei "${texto}" -> ficou "${valor}"` +
      `${comFoco ? '' : '  (o foco saiu do campo)'}`,
  );

  await ctx.close();
}

await navegador.close();
process.exit(falhou ? 1 : 0);
