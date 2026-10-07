'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { isMonth, monthLabel } from '@/domain/condominio/months';
import { createPeriodAction } from '../actions';

/** Novo relatório: escolhe mês/ano e vai para a Central de uploads. Mês existente → abre o que já existe. */
export function NewPeriod({ suggested }: { suggested: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês do relatório" />
        <Button disabled={pending || !isMonth(month)} onClick={() => start(async () => {
          setError(null);
          const r = await createPeriodAction(month);
          if (!r.ok) return setError(r.error);
          router.push(`/financeiro/competencias/${r.data.month}`);
        })}><Plus /> {pending ? 'Criando…' : `Novo relatório${isMonth(month) ? ` ${monthLabel(month)}` : ''}`}</Button>
      </div>
      <FormMessage error={error} />
    </div>
  );
}
