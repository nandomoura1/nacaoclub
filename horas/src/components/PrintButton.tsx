'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton({ label = 'Imprimir', auto = false }: { label?: string; auto?: boolean }) {
  // Página aberta só para imprimir: já abre a janela de impressão.
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return <Button variant="secondary" onClick={() => window.print()}><Printer /> {label}</Button>;
}
