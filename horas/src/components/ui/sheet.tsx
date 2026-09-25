'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Painel lateral (desktop) que vira tela cheia no celular. Esc fecha. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda px-6 py-4">
          <h2 className="text-lg font-extrabold text-navy">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-tinta-fraca hover:text-tinta">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-borda px-6 py-4">{footer}</div>
      </form>
    </div>
  );
}
