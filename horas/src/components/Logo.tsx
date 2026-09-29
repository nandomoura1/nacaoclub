import { cn } from '@/lib/cn';

/**
 * Escudo oficial da Nação (recortado da logo por scripts/make-app-icons.mjs).
 * `dark` = sobre fundo escuro (N branco); `light` = impressão/fundo claro.
 */
export function ShieldMark({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={tone === 'dark' ? '/brand/escudo-branco.png' : '/brand/escudo-cor.png'} alt="" aria-hidden width={25} height={32} className={cn('h-8 w-auto', className)} />;
}

export function Logo({ className, subtitle = true, tone = 'dark' }: { className?: string; subtitle?: boolean; tone?: 'dark' | 'light' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <ShieldMark tone={tone} />
      <span className="leading-none">
        <span className="font-titulo block text-[15px] font-extrabold tracking-tight">NAÇÃO</span>
        {subtitle && (
          <span className="mt-1 block text-[10px] font-semibold tracking-[0.28em] opacity-70">
            ADM
          </span>
        )}
      </span>
    </span>
  );
}
