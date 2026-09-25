/**
 * Normalização de nomes para casar a planilha com o cadastro:
 * "  LUÍZA  Eduarda " → "luiza eduarda". Usada nos apelidos da importação.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
