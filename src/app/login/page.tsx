'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, OndasFundo } from '@/components/Logo';

/**
 * Tela de login (seção 58).
 * Fundo navy, ondas discretas, estética premium. Dois campos e um botão —
 * nada além disso precisa estar aqui.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? 'Não foi possível entrar.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErro('Falha de conexão. Verifique sua rede.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="gradiente-nacao relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <OndasFundo />

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo variant="claro" />
        </div>

        <div className="mb-9 text-center">
          <h1 className="font-titulo text-[34px] leading-none font-extrabold text-white">
            QUEM CHEGOU<span className="text-ciano">?</span>
          </h1>
          <p className="mt-3 text-[13px] tracking-[0.22em] text-white/60 uppercase">
            Conheça · Conecte · Cuide
          </p>
        </div>

        <form
          onSubmit={entrar}
          className="rounded-2xl bg-white p-7 shadow-[0_18px_50px_-12px_rgba(2,43,87,0.45)]"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-wide text-tinta-suave uppercase">
              E-mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-lg border border-borda bg-white px-3.5 py-3 text-[15px] text-tinta outline-none transition focus:border-nacao focus:ring-2 focus:ring-nacao/15"
              placeholder="voce@nacaoclub.com.br"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-wide text-tinta-suave uppercase">
              Senha
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-borda bg-white px-3.5 py-3 text-[15px] text-tinta outline-none transition focus:border-nacao focus:ring-2 focus:ring-nacao/15"
              placeholder="••••••••"
            />
          </label>

          {erro && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-critico/20 bg-critico/5 px-3.5 py-2.5 text-[13px] text-critico"
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="font-titulo w-full rounded-lg bg-nacao py-3.5 text-[14px] font-bold tracking-wide text-white uppercase transition hover:bg-nacao-600 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/40">
          Uso interno · Nação Club
        </p>
      </div>
    </main>
  );
}
