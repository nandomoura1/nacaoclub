import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cyan';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  // #0169E9 é a cor de CTA definida na hierarquia do manual
  primary:
    'bg-nacao-blue text-white hover:bg-nacao-sky active:bg-nacao-blue shadow-[0_6px_20px_-8px_rgba(1,105,233,0.9)]',
  // #20C4FA: energia — usado com parcimônia, em ações de destaque
  cyan: 'bg-nacao-cyan text-nacao-navy hover:bg-white active:bg-nacao-cyan font-extrabold',
  secondary: 'bg-white/10 text-white hover:bg-white/[0.16] border border-white/15',
  ghost: 'bg-transparent text-white/75 hover:text-white hover:bg-white/[0.07]',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-6 text-base',
  // xl: alvo generoso para o dia do evento (§16: dedo, pressa, tablet)
  xl: 'h-16 px-8 text-lg',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-display font-bold uppercase tracking-wide transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
  target?: string;
  rel?: string;
  download?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
