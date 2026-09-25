import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badge = cva('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-fundo text-tinta-suave ring-1 ring-borda',
      blue: 'bg-nacao/10 text-nacao',
      navy: 'bg-navy text-white',
      cyan: 'bg-ciano/15 text-navy-700',
      green: 'bg-sucesso/10 text-sucesso',
      amber: 'bg-atencao/10 text-atencao',
      red: 'bg-critico/10 text-critico',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
