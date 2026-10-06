'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { monthLabel, type Month } from '@/domain/condominio/months';
import { openPeriodAction } from '../actions';

/** Abre a competência (mês vencido) copiando a anterior. */
export function OpenPeriod({ suggested }: { suggested: Month }) {
  const router = useRouter();
  const [month, setMonth] = useState<string>(suggested);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Competência" />
        <Button disabled={pending || !month} onClick={() => start(async () => {
          setError(null);
          const r = await openPeriodAction(month);
          if (!r.ok) return setError(r.error);
          router.push(`/condominio/competencias/${r.data}`);
        })}><Plus /> {pending ? 'Abrindo…' : `Abrir ${/^\d{4}-\d{2}$/.test(month) ? monthLabel(month as Month) : 'competência'}`}</Button>
      </div>
      <FormMessage error={error} />
    </div>
  );
}
