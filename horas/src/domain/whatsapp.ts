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
