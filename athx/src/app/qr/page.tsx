import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PageIntro } from '@/components/PageIntro';
import { QrPanel } from '@/components/QrPanel';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = {
  title: 'QR Code',
  description: 'QR Code do leaderboard para banners e telas do evento.',
};

export default function QrPage() {
  const target = `${SITE_URL.replace(/\/$/, '')}/leaderboard`;

  return (
    <>
      <SiteHeader />
      <PageIntro kicker="Para banners e telas" title="QR Code" subtitle="Leaderboard ao vivo" />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <QrPanel target={target} />

        <div className="mt-10 space-y-2 text-sm text-white/55">
          <p>
            <strong className="font-display font-bold text-white uppercase">Como usar:</strong>{' '}
            imprima em banner, coloque no telão ou compartilhe nos stories. Quem apontar a
            câmera cai direto no leaderboard, sem login e sem instalar nada.
          </p>
          <p className="text-xs text-white/40">
            O endereço vem de <code className="rounded bg-white/10 px-1.5 py-0.5">NEXT_PUBLIC_SITE_URL</code>.
            Antes de imprimir, confirme que essa variável aponta para o domínio de produção —
            e não para localhost.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
