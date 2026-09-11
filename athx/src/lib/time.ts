/**
 * Conversão de tempo para o WOD 3 (§21).
 * O juiz digita MM:SS — o sistema converte para segundos internamente.
 *   "14:32" -> 872
 *   872     -> "14:32"
 * Nunca obrigar o operador a fazer a conta na mão.
 */

const TIME_PATTERN = /^(\d{1,3}):([0-5]\d)$/;

/** MM:SS -> segundos. Retorna null se o formato for inválido. */
export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Também aceita segundos puros ("872") para colar de planilha.
  if (/^\d+$/.test(trimmed)) {
    const asSeconds = Number(trimmed);
    return Number.isSafeInteger(asSeconds) && asSeconds >= 0 ? asSeconds : null;
  }

  const match = TIME_PATTERN.exec(trimmed.replace(/\s/g, ''));
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

/** segundos -> MM:SS (sempre com dois dígitos nos segundos). */
export function formatSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) {
    return '—';
  }
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function isValidTimeInput(input: string): boolean {
  return parseTimeToSeconds(input) !== null;
}
