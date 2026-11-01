import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { requestMeta } from '@/server/auth/session';
import { openSignLink } from '@/server/services/contract-service';
import { SignClient } from './SignClient';

export const metadata: Metadata = { title: 'Assinar contrato', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/** Página pública: quem recebeu o link lê o contrato e assina com o código enviado ao WhatsApp. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await openSignLink(token, await requestMeta());
  return (
    <main className="min-h-dvh bg-fundo">
      <header className="bg-navy px-4 py-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Logo tone="light" />
          {view && <span className="font-mono text-sm font-semibold">{view.code}</span>}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {view ? (
          <SignClient token={token} view={view} />
        ) : (
          <div className="rounded-2xl border border-borda bg-white p-6 text-center">
            <h1 className="text-lg font-extrabold text-navy">Link inválido ou expirado</h1>
            <p className="mt-2 text-sm text-tinta-suave">Este link não vale mais (pode ter sido substituído por um novo ou o contrato foi cancelado). Peça um novo link para a Nação Club.</p>
          </div>
        )}
        <p className="mt-8 text-center text-xs text-tinta-fraca">Nação Club · Muitos esportes, muitas paixões, uma Nação!</p>
      </div>
    </main>
  );
}
