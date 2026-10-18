'use client';

import { useLayoutEffect, useRef } from 'react';

/** A4 deitado com margem de 7 mm: área útil 283 × 196 mm (um pouco menos na altura para não vazar uma 2ª folha). */
const SHEET_W_MM = 283;
const SHEET_H_MM = 194;
const mm = (v: number) => (v * 96) / 25.4;

/**
 * Encaixa o conteúdo numa folha: se sobra espaço, estica a tabela até o fim do
 * papel; se não cabe, reduz tudo por igual (zoom) mantendo a largura total.
 * Recalcula antes de imprimir e quando as fontes carregam.
 */
export function FitSheet({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const fit = () => {
      const table = el.querySelector('table');
      const W = mm(SHEET_W_MM), H = mm(SHEET_H_MM);
      el.style.zoom = '1'; el.style.width = `${W}px`;
      if (table) table.style.height = '';
      let z = 1;
      // A largura muda a quebra de linha (e a altura): algumas voltas até estabilizar.
      for (let i = 0; i < 4; i++) {
        el.style.width = `${W / z}px`;
        const h = el.scrollHeight;
        const next = Math.min(1, H / h);
        if (Math.abs(next - z) < 0.003) { z = next; break; }
        z = next;
      }
      el.style.width = `${W / z}px`;
      el.style.zoom = String(z);
      // Sobrou papel: as linhas da tabela crescem até o fim da folha.
      const free = H / z - el.scrollHeight;
      if (table && free > 4) table.style.height = `${table.offsetHeight + free - 2}px`;
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener('beforeprint', fit);
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener('beforeprint', fit); window.removeEventListener('resize', fit); };
  }, [enabled]);
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <div ref={ref} className={enabled ? 'mx-auto origin-top-left bg-white print:m-0 print:shadow-none shadow-sm ring-1 ring-borda print:ring-0 p-0' : ''}>{children}</div>
    </div>
  );
}
