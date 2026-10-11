'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { createMeetingAction } from '../actions';
import { useRun } from '../_components/useRun';

export function NewMeetingButton({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const { msg, pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" aria-label="Data da reunião" />
      <Button size="sm" disabled={pending || !date} onClick={() => run(() => createMeetingAction(date), (r) => r.ok && router.push(`/marketing/reuniao/${r.data}`))}><Plus /> Nova reunião</Button>
      <FormMessage error={msg.error} />
    </div>
  );
}
