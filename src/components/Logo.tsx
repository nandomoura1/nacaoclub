/**
 * Marca Nação Club.
 *
 * O arquivo oficial do logotipo não está no repositório — ele é licenciado e
 * deve ser adicionado em /public/logo-nacao.svg pela equipe da Nação.
 * Até lá, esta é uma assinatura tipográfica que respeita a paleta e a
 * proporção do manual: sem distorção, sem efeito, sem rotação.
 *
 * A marca não domina a tela (seção 54) — ela assina.
 */
export function Logo({ variant = 'claro' }: { variant?: 'claro' | 'escuro' }) {
  const principal = variant === 'claro' ? 'text-white' : 'text-navy';
  const secundaria = variant === 'claro' ? 'text-ciano' : 'text-nacao';

  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        {/* Ondas concêntricas: água, vento, movimento — a linguagem gráfica da marca */}
        <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" className={secundaria} opacity="0.35" />
        <path
          d="M3 18c3.2-4 6.4-4 9.6 0s6.4 4 9.6 0 6.4-4 9.6 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={secundaria}
        />
        <path
          d="M6 12c2.5-3 5-3 7.5 0s5 3 7.5 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={principal}
          opacity="0.65"
        />
      </svg>
      <span className={`font-titulo text-[15px] font-extrabold tracking-tight ${principal}`}>
        NAÇÃO<span className={`ml-1 font-light ${secundaria}`}>CLUB</span>
      </span>
    </div>
  );
}

/** Ondas decorativas de fundo. Sutis, atrás da informação, sempre. */
export function OndasFundo() {
  return (
    <div className="onda-nacao" aria-hidden="true">
      <svg
        className="absolute -bottom-8 left-0 w-[140%] min-w-[900px]"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 200c150-70 300-70 450 0s300 70 450 0 300-70 300 0v120H0z"
          fill="#20C4FA"
          opacity="0.10"
        />
        <path
          d="M0 240c150-60 300-60 450 0s300 60 450 0 300-60 300 0v80H0z"
          fill="#3A86FF"
          opacity="0.12"
        />
      </svg>
    </div>
  );
}
