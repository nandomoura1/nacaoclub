'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

/** Login administrativo com Supabase Auth (§17). */
export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (demo) {
    return (
      <Card className="space-y-3 p-5 text-center">
        <p className="font-display text-sm font-bold uppercase">Modo demonstração</p>
        <p className="text-sm text-white/55">
          Não há login porque não há banco: a aplicação está rodando com dados fictícios.
          Configure o Supabase e defina{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-nacao-cyan">
            NEXT_PUBLIC_DEMO_MODE=false
          </code>{' '}
          para habilitar a área administrativa.
        </p>
        <Link
          href="/admin"
          className="inline-block font-display text-xs font-bold tracking-wider text-nacao-cyan uppercase"
        >
          Ver o painel em somente leitura
        </Link>
      </Card>
    );
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

      if (error) {
        setErro(
          error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos.'
            : error.message,
        );
        return;
      }

      router.replace(params.get('redirect') ?? '/admin');
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={entrar} className="space-y-4">
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          placeholder="voce@nacaoclub.com.br"
        />
        <Input
          label="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          required
        />

        {erro ? (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {erro}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          <LogIn size={16} aria-hidden="true" />
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </Card>
  );
}
