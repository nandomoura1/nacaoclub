import type { Category } from '@/types/domain';
import { CATEGORY_LABEL } from '@/types/domain';

export function ordinal(position: number): string {
  return `${position}º`;
}

/** 930 -> "930 kg" · 937.5 -> "937,5 kg" */
export function kg(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace('.', ',');
  return `${formatted} kg`;
}

/** 11.65 -> "11,65 km" */
export function km(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(digits).replace('.', ',')} km`;
}

/** 1.5 -> "1,5" · 7 -> "7" */
export function points(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category];
}

/** Número da dupla sempre com dois dígitos: 7 -> "07" */
export function teamNumber(n: number): string {
  return String(n).padStart(2, '0');
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Normaliza para busca: minúsculas e sem acento.
 * "João" e "joao" precisam encontrar a mesma dupla.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
