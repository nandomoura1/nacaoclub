'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, UserPlus } from 'lucide-react';
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** 'entrar' para quem já tem senha; 'criar' no primeiro acesso. */
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');

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

  /**
   * Primeiro acesso.
   *
   * A organização autoriza o e-mail em /admin/equipe; a pessoa cria aqui a
   * própria senha. Ninguém digita senha de outra pessoa, e o sistema não
   * precisa guardar a chave mestra do banco para criar contas (§35).
   *
   * Criar conta NÃO dá acesso: quem manda é athx_is_admin(), que só aceita
   * e-mail autorizado. Uma conta de alguém de fora não enxerga nada além do
   * que o público já vê — o RLS cuida disso no Postgres.
   */
  async function criarSenha() {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password: senha });

    if (error) {
      setErro(
        /already registered|User already/i.test(error.message)
          ? 'Esse e-mail já tem conta. Use "Já tenho senha" para entrar.'
          : /at least|password/i.test(error.message)
            ? 'A senha é curta demais. Use pelo menos 6 caracteres.'
            : error.message,
      );
      return;
    }

    // Sem sessão = o Supabase está exigindo confirmação por e-mail.
    if (!data.session) {
      setAviso(
        'Conta criada. Confira a caixa de entrada e clique no link de confirmação — depois volte aqui e entre com a senha que acabou de criar.',
      );
      setModo('entrar');
      return;
    }

    router.replace(params.get('redirect') ?? '/admin');
    router.refresh();
  }

  async function entrarComSenha() {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos. Se é seu primeiro acesso, use "Criar minha senha".'
          : /not confirmed/i.test(error.message)
            ? 'Falta confirmar o e-mail. Procure a mensagem do Supabase na sua caixa de entrada.'
            : error.message,
      );
      return;
    }

    router.replace(params.get('redirect') ?? '/admin');
    router.refresh();
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);

    try {
      if (modo === 'criar') await criarSenha();
      else await entrarComSenha();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível concluir.');
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
          autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
          required
          minLength={modo === 'criar' ? 6 : undefined}
          hint={modo === 'criar' ? 'Pelo menos 6 caracteres. Você escolhe — ninguém mais vê.' : undefined}
        />

        {erro ? (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {erro}
          </p>
        ) : null}

        {aviso ? (
          <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {aviso}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {modo === 'criar' ? (
            <UserPlus size={16} aria-hidden="true" />
          ) : (
            <LogIn size={16} aria-hidden="true" />
          )}
          {enviando
            ? modo === 'criar'
              ? 'Criando…'
              : 'Entrando…'
            : modo === 'criar'
              ? 'Criar minha senha'
              : 'Entrar'}
        </Button>

        {/* O primeiro acesso é de quem a organização autorizou em
            /admin/equipe. Criar conta por conta própria não dá acesso a
            nada: quem decide é o e-mail autorizado, verificado no banco. */}
        <button
          type="button"
          onClick={() => {
            setModo(modo === 'criar' ? 'entrar' : 'criar');
            setErro(null);
            setAviso(null);
          }}
          className="block w-full text-center font-display text-[11px] font-bold tracking-wider text-white/50 uppercase hover:text-nacao-cyan"
        >
          {modo === 'criar' ? 'Já tenho senha — entrar' : 'Primeiro acesso — criar minha senha'}
        </button>
      </form>
    </Card>
  );
}
