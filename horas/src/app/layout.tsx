import type { Metadata, Viewport } from 'next';
import { Montserrat, Nunito } from 'next/font/google';
import '@/styles/globals.css';

const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', weight: ['600', '700', '800'] });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Nação ADM', template: '%s · Nação ADM' },
  applicationName: 'Nação ADM',
  description: 'Gestão de horas, escalas e treinos da Nação Club.',
  robots: { index: false, follow: false },
  // iPhone: "Adicionar à Tela de Início" abre em tela cheia, com o nome e o ícone da Nação.
  appleWebApp: { capable: true, title: 'Nação ADM', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#022B57', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${nunito.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
