'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-fundo px-2 py-1 text-xs ring-1 ring-borda">{value}</code>
      <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}><Copy /> {ok ? 'Copiado!' : 'Copiar'}</Button>
    </div>
  );
}
