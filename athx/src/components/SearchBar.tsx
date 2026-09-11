'use client';

import { Search, X } from 'lucide-react';
import { useId } from 'react';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Pesquisar dupla ou atleta',
  resultCount,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  resultCount?: number;
}) {
  const id = useId();

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/40"
      />
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-13 w-full rounded-xl border border-white/12 bg-white/[0.06] pr-11 pl-11 text-base text-white placeholder:text-white/38 focus:border-nacao-cyan/60 focus:bg-white/[0.09]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar pesquisa"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}

      {/* Resultado anunciado para leitores de tela sem roubar o foco. */}
      <p className="sr-only" role="status" aria-live="polite">
        {value && resultCount !== undefined
          ? `${resultCount} ${resultCount === 1 ? 'dupla encontrada' : 'duplas encontradas'}`
          : ''}
      </p>
    </div>
  );
}
