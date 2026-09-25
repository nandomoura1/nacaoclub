'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import type { ActionResult } from '@/server/action-result';
import { changePasswordAction } from './actions';

export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(changePasswordAction, null);

  useEffect(() => {
    if (state?.ok && forced) router.replace('/hoje');
  }, [state, forced, router]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="current">{forced ? 'Senha provisória' : 'Senha atual'}</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="next">Nova senha</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <Label htmlFor="confirm">Repita a nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage error={state && !state.ok ? state.error : null} success={state?.ok ? state.message : null} />
      <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar nova senha'}</Button>
    </form>
  );
}
