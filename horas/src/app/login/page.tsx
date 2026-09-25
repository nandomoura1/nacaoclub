import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getPrincipal } from '@/server/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getPrincipal()) redirect('/hoje');
  const { next } = await searchParams;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-navy px-4">
      <Waves />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-white">
          <Logo />
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h1 className="text-xl font-extrabold text-navy">Entrar</h1>
          <p className="mb-6 mt-1 text-sm text-tinta-suave">
            A grade é fixa. O calendário muda. Você cuida só das exceções.
          </p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-white/60">
          Muitos esportes, muitas paixões, uma Nação!
        </p>
      </div>
    </main>
  );
}

/** Ondas do manual da marca — só no login e em estados vazios, nunca atrás de dado. */
function Waves() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-25" preserveAspectRatio="none" viewBox="0 0 400 400" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <path
          key={i}
          d={`M-20 ${40 + i * 24} C 80 ${10 + i * 24}, 160 ${90 + i * 24}, 240 ${50 + i * 24} S 380 ${20 + i * 24}, 440 ${60 + i * 24}`}
          fill="none"
          stroke="#20C4FA"
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
}
