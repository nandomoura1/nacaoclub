'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseBRL } from '@/domain/condominio/money';
import { cn } from '@/lib/cn';

const show = (cents: number | null) => (cents === null ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Valor em reais digitado do jeito brasileiro ("2.136,75"); guarda centavos. */
export function MoneyInput({ value, onChange, className, ...props }: { value: number | null; onChange: (cents: number | null) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(show(value)); }, [value, focused]);
  return (
    <Input
      inputMode="decimal"
      className={cn('text-right tabular-nums', className)}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => { setText(e.target.value); onChange(parseBRL(e.target.value)); }}
      onBlur={() => { setFocused(false); setText(show(parseBRL(text))); }}
      {...props}
    />
  );
}
