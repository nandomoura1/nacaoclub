import { cn } from '@/lib/cn';

/**
 * Assinatura "N" no escudo, inspirada na Proposta 3 do manual.
 * Quando a Nação fornecer o arquivo oficial, substituir por /public/logo-nacao.svg.
 */
export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 46" aria-hidden className={cn('h-8 w-8', className)}>
      <path d="M3 3h34v24c0 8-7 13.5-17 17C10 40.5 3 35 3 27V3Z" fill="#0169E9" />
      <path d="M8 8h24v18.5c0 5.5-4.8 9.4-12 12-7.2-2.6-12-6.5-12-12V8Z" fill="#fff" />
      <path d="M13.5 29V13h3.6l7.4 10V13h3v16h-3.4l-7.6-10.2V29h-3Z" fill="#022B57" />
    </svg>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <ShieldMark />
      <span className="leading-none">
        <span className="font-titulo block text-[15px] font-extrabold tracking-tight">NAÇÃO</span>
        {subtitle && (
          <span className="block text-[10px] font-semibold tracking-[0.28em] opacity-70">
            GESTÃO DE HORAS
          </span>
        )}
      </span>
    </span>
  );
}
