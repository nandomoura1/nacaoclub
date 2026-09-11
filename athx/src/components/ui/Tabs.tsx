'use client';

import type { ReactNode } from 'react';

export type TabOption<T extends string> = { value: T; label: string; badge?: ReactNode };

/**
 * Tabs — grupo de filtros acessível (role=tablist + setas do teclado).
 * Nunca depende só de cor para indicar o item ativo: usa aria-selected + peso.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs';

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = e.key === 'ArrowRight' ? (i + 1) % options.length : (i - 1 + options.length) % options.length;
        const target = options[next];
        if (target) onChange(target.value);
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border font-display font-bold uppercase tracking-wide transition-colors ${pad} ${
              active
                ? 'border-nacao-cyan/55 bg-nacao-cyan/15 text-nacao-cyan'
                : 'border-white/12 bg-white/[0.04] text-white/55 hover:bg-white/[0.09] hover:text-white/85'
            }`}
          >
            {opt.label}
            {opt.badge ? <span className="ml-1.5 opacity-70">{opt.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
