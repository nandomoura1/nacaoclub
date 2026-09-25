import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
        error ? 'bg-critico/10 text-critico' : 'bg-sucesso/10 text-sucesso',
      )}
    >
      {error ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
      <span>{error ?? success}</span>
    </p>
  );
}
