import type { MetadataRoute } from 'next';

/** App instalável (Android/Chrome e desktop): ícone na tela inicial e abertura em tela cheia. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nação ADM',
    short_name: 'Nação ADM',
    description: 'Gestão de horas, escalas e treinos da Nação Club.',
    id: '/',
    start_url: '/hoje',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#022B57',
    theme_color: '#022B57',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Hoje', url: '/hoje', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Escalas', url: '/escalas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Cadastro de Treino', url: '/treinos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
