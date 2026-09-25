'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/alert';
import { setupAction } from './actions';

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <div><Label htmlFor="token">Código de primeiro acesso (SETUP_TOKEN)</Label><Input id="token" name="token" required autoComplete="off" /></div>
      <div><Label htmlFor="name">Seu nome</Label><Input id="name" name="name" required /></div>
      <div><Label htmlFor="email">Seu e-mail</Label><Input id="email" name="email" type="email" required autoComplete="username" /></div>
      <div><Label htmlFor="password">Crie sua senha (mínimo 10 caracteres)</Label><Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
      <FormMessage error={state.error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? 'Configurando… (leva alguns segundos)' : 'Configurar o sistema'}</Button>
    </form>
  );
}
