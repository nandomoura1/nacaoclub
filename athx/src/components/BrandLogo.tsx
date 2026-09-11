'use client';

import { useEffect, useState } from 'react';

/**
 * BrandLogo — assinatura da Nação Club.
 *
 * REGRA DO MANUAL (§39): a logomarca oficial NÃO é redesenhada aqui. O
 * escudo com o "N" é propriedade da marca e não se reproduz por aproximação.
 *
 * Como funciona:
 *   · o componente procura o arquivo oficial em /logo-nacao-club.svg;
 *   · enquanto ele não existir, mostra uma assinatura TIPOGRÁFICA com a
 *     mesma construção do wordmark do manual — NAÇÃO em peso alto, filete,
 *     C L U B em tracking largo. É um placeholder honesto, não uma cópia.
 *
 * Por que a checagem é feita com `new Image()` e não com <img onError>:
 * o erro de carregamento acontece ANTES do React hidratar, então o onError
 * nunca dispara e o usuário vê o ícone de imagem quebrada. Aqui o arquivo é
 * testado em memória e só entra no DOM depois de carregar de verdade.
 *
 * Para ativar a logo oficial: basta salvar o SVG em
 * public/logo-nacao-club.svg. Nenhuma linha de código muda.
 */

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, { img: string; nacao: string; club: string; rule: string }> = {
  sm: { img: 'h-8', nacao: 'text-base', club: 'text-[8px]', rule: 'my-[3px]' },
  md: { img: 'h-11', nacao: 'text-xl', club: 'text-[9px]', rule: 'my-1' },
  lg: { img: 'h-16', nacao: 'text-3xl sm:text-4xl', club: 'text-[11px]', rule: 'my-1.5' },
};

const OFFICIAL_LOGO = '/logo-nacao-club.svg';

export function BrandLogo({
  size = 'md',
  className = '',
}: {
  size?: Size;
  className?: string;
}) {
  const [officialAvailable, setOfficialAvailable] = useState(false);
  const s = SIZES[size];

  useEffect(() => {
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setOfficialAvailable(true);
    };
    probe.src = OFFICIAL_LOGO;
    return () => {
      cancelled = true;
    };
  }, []);

  if (officialAvailable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={OFFICIAL_LOGO} alt="Nação Club" className={`${s.img} w-auto ${className}`} />
    );
  }

  return (
    <span
      className={`inline-flex flex-col leading-none ${className}`}
      role="img"
      aria-label="Nação Club"
    >
      <span className={`font-display font-extrabold ${s.nacao} tracking-[-0.03em] text-white`}>
        NAÇÃO
      </span>
      <span className={`${s.rule} h-px w-full bg-nacao-cyan/70`} aria-hidden="true" />
      <span className={`font-display ${s.club} tracking-signature font-medium text-white/85`}>
        CLUB
      </span>
    </span>
  );
}
