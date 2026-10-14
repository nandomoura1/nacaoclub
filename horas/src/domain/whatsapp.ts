/**
 * WhatsApp (puro): normaliza o destino e mascara para o registro.
 * Destino = telefone brasileiro (com ou sem 55) ou ID de grupo da Z-API.
 */

export const WA_KINDS = [
  { id: 'TESTE', label: 'Teste' },
  { id: 'ACESSO', label: 'Acesso ao sistema' },
  { id: 'ESCALA', label: 'Escala' },
  { id: 'CONDOMINIO', label: 'Cobrança do condomínio' },
  { id: 'TREINO', label: 'Treino' },
  { id: 'RELATORIO', label: 'Relatório' },
  { id: 'DEMANDAS', label: 'Lembrete de demandas' },
  { id: 'GRADE', label: 'Grade do professor' },
  { id: 'COMUNICADO', label: 'Comunicado interno' },
  { id: 'LIVRE', label: 'Mensagem' },
] as const;
export type WaKind = (typeof WA_KINDS)[number]['id'];

const isGroup = (v: string) => /^[0-9]{6,}-group$|^[0-9]{15,}$/.test(v);

/** "(61) 98466-2806" → "5561984662806"; ID de grupo passa direto; inválido → null. */
export function normalizeDestination(input: string): string | null {
  const v = input.trim();
  if (/-group$/i.test(v)) return isGroup(v.toLowerCase()) ? v.toLowerCase() : null;
  const d = v.replace(/\D/g, '');
  if (d.length >= 15) return d; // ID numérico de grupo/comunidade
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

/** Para o registro: "(61) 9••••-2806" / "grupo …1234". Nunca o número inteiro. */
export function maskDestination(dest: string): string {
  if (/-group$/.test(dest) || dest.length >= 15) return `grupo …${dest.replace(/\D/g, '').slice(-4)}`;
  const local = dest.startsWith('55') ? dest.slice(2) : dest;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  return `(${ddd}) ${rest.slice(0, 1)}••••-${rest.slice(-4)}`;
}

/** Prévia segura: corta e nunca guarda mensagem com senha. */
export function previewOf(text: string, hasSecret: boolean): string | null {
  if (hasSecret) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

/** Mensagem de acesso ao sistema (novo login ou senha redefinida). */
export function accessMessage(a: { name: string; email: string; password: string; url: string }): string {
  return [
    `Olá, ${a.name.split(' ')[0]}! 💙`,
    '',
    'Seu acesso ao *Nação ADM*:',
    `🔗 ${a.url}`,
    `📧 Login: ${a.email}`,
    `🔑 Senha temporária: *${a.password}*`,
    '',
    'No primeiro acesso o sistema pede para você criar uma senha nova. Não compartilhe esta mensagem.',
  ].join('\n');
}

/**
 * Chave para casar números: DDD + 8 últimos dígitos. O WhatsApp às vezes
 * devolve celular sem o 9 (55 61 9999-8888 vs 55 61 99999-8888).
 */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return `${d.slice(0, 2)}${d.slice(-8)}`;
}

/** Resposta de confirmação: "ok", "sim", "confirmo", 👍, ✅… */
export function isConfirmation(text: string | null | undefined): boolean {
  const t = (text ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return false;
  if (/^(👍|✅|👌|☑️|✔️)+$/u.test(t.replace(/\s/g, ''))) return true;
  if (/^(ok+|okay|sim|s|confirm(o|ado|ada|ada)?|certo|ta certo|esta certo|tudo certo|tudo ok|perfeito|de acordo|combinado)[\s.!👍✅👌]*$/u.test(t)) return true;
  // Combinações curtas só de palavras de "ok" ("Ok, ciente", "lido 👍", "recebido, obrigado").
  const OK = new Set(['ok', 'okk', 'okay', 'sim', 'ciente', 'lido', 'li', 'recebido', 'recebi', 'entendido', 'entendi', 'certo', 'beleza', 'blz', 'combinado', 'confirmado', 'confirmo', 'perfeito', 'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'show', 'top', 'tudo', 'e', 'esta', 'ta']);
  const words = t.replace(/[👍✅👌☑️✔️🙏💙]/gu, ' ').split(/[\s,.;!]+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((w) => OK.has(w)) && words.some((w) => !['obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'tudo', 'e', 'esta', 'ta'].includes(w));
}
