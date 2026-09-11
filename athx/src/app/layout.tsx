import type { Metadata, Viewport } from 'next';
import { Montserrat, Nunito_Sans } from 'next/font/google';
import '@/styles/globals.css';

/**
 * TIPOGRAFIA (§4)
 *
 * O manual da marca especifica Gotham (títulos) e Gotham Rounded Light
 * (corpo). São fontes licenciadas e não redistribuíveis, então o sistema:
 *
 *   1. usa Gotham quando ela estiver instalada/licenciada (o stack em
 *      globals.css tenta 'Gotham' antes do fallback);
 *   2. cai em Montserrat (geometria quase idêntica à Gotham) e Nunito Sans
 *      (a alternativa web mais próxima da Gotham Rounded Light).
 *
 * Para trocar pela fonte oficial depois, basta adicionar o @font-face e
 * nada mais muda: todo o app referencia --font-display / --font-body.
 */
const display = Montserrat({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-nacao-display',
  display: 'swap',
});

const body = Nunito_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-nacao-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'NAÇÃO ATHX — Live Leaderboard',
    template: '%s · NAÇÃO ATHX',
  },
  description:
    'Leaderboard ao vivo do Nação Celebration — Etapa Setembro Amarelo. 12 de setembro, Nação Club, Brasília.',
  applicationName: 'NAÇÃO ATHX',
  openGraph: {
    title: 'NAÇÃO ATHX — Live Leaderboard',
    description: 'Classificação ao vivo do Nação Celebration. Muitos esportes, muitas paixões, uma Nação!',
    type: 'website',
    locale: 'pt_BR',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#022B57',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
