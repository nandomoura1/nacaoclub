import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const field =
  'h-10 w-full rounded-lg border border-borda bg-white px-3 text-sm text-tinta placeholder:text-tinta-fraca focus:border-nacao focus:outline-none focus:ring-2 focus:ring-nacao/20 disabled:bg-fundo';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, 'pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-semibold text-tinta-suave', className)} {...props} />;
}
