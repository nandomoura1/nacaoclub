import type { MetadataRoute } from 'next';

/**
 * O MANIFESTO — o que o celular usa ao salvar o site na tela inicial.
 *
 * Sem ele, o Android monta a tela de abertura com o ícone centralizado sobre
 * um FUNDO BRANCO padrão: o resultado é um quadrado navy boiando no branco,
 * que foi exatamente o que a organização viu.
 *
 * Com `background_color` igual ao fundo do ícone, os dois viram a mesma cor
 * e a abertura fica sendo o escudo sobre o navy do manual, de borda a borda.
 * O quadrado desaparece porque deixa de ter contra o que contrastar.
 *
 * Duas versões do ícone, e a diferença importa:
 *
 *   normal     usado na tela de abertura e onde o sistema não recorta
 *   maskable   o Android recorta o ícone em círculo ou quadrado arredondado.
 *              Esta versão tem o escudo menor, dentro da zona segura (os 80%
 *              centrais), senão as pontas saem cortadas no lançador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nação Híbrida — Leaderboard',
    short_name: 'Nação Híbrida',
    description:
      'Classificação ao vivo das etapas do Nação Híbrida. Muitos esportes, muitas paixões, uma Nação!',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // O navy #022B57 do manual, o mesmo fundo do ícone e das telas.
    background_color: '#022B57',
    theme_color: '#022B57',
    lang: 'pt-BR',
    categories: ['sports'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icone-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Atalhos no toque longo do ícone: o atleta quer o leaderboard, a
    // organização quer lançar resultado. Ninguém quer a home.
    shortcuts: [
      { name: 'Leaderboard ao vivo', url: '/leaderboard' },
      { name: 'Programação', url: '/schedule' },
      { name: 'Área da organização', url: '/admin' },
    ],
  };
}
