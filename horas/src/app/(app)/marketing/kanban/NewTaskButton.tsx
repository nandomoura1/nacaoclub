'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MktOptions } from '@/server/services/marketing-service';
import { TaskSheet, type TaskDefaults } from '../_components/TaskSheet';

/** Ação rápida "+ Tarefa" (abre o painel de tarefa). */
export function NewTaskButton({ options, siblings, defaults, label = 'Tarefa', variant = 'primary' }: {
  options: MktOptions; siblings?: { id: string; title: string; campaignId: string | null }[]; defaults?: TaskDefaults; label?: string; variant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus /> {label}</Button>
      {open && <TaskSheet taskId={null} defaults={defaults} options={options} siblings={siblings} canEdit onClose={() => setOpen(false)} />}
    </>
  );
}
