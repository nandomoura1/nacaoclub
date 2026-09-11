import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/admin/LoginForm';
import { BrandLogo } from '@/components/BrandLogo';
import { WaveField, SkyGlow } from '@/components/WaveField';
import { IS_DEMO } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main
      id="conteudo"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10"
    >
      <SkyGlow />
      <WaveField intensity="subtle" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandLogo size="lg" />
          <div>
            <h1 className="font-display text-2xl font-black tracking-tight uppercase">
              Área da organização
            </h1>
            <p className="mt-1 font-display text-[10px] font-bold tracking-signature text-nacao-cyan uppercase">
              Nação ATHX
            </p>
          </div>
        </div>

        <Suspense fallback={null}>
          <LoginForm demo={IS_DEMO} />
        </Suspense>

        <p className="mt-6 text-center text-xs text-white/35">
          O público não precisa de login. Esta tela é só para lançar resultados.
        </p>
      </div>
    </main>
  );
}
