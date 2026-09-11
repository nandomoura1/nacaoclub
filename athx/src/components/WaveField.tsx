/**
 * WaveField — elemento gráfico do manual da marca.
 *
 * O manual usa linhas concêntricas finas (faixa inferior) como assinatura
 * visual de movimento. Aqui elas aparecem em opacidade baixa, atrás do
 * conteúdo, nunca competindo com ele (§38: "usar de forma sutil").
 */
export function WaveField({
  className = '',
  intensity = 'normal',
}: {
  className?: string;
  intensity?: 'subtle' | 'normal' | 'strong';
}) {
  const opacity = intensity === 'subtle' ? 0.1 : intensity === 'strong' ? 0.34 : 0.18;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="nacao-wave-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--nacao-cyan)" stopOpacity="0" />
          <stop offset="42%" stopColor="var(--nacao-cyan)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--nacao-sky)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#nacao-wave-grad)"
        strokeWidth="1"
        opacity={opacity}
      >
        {Array.from({ length: 9 }, (_, i) => {
          const offset = i * 26;
          return (
            <path
              key={i}
              d={`M -80 ${300 + offset} C 220 ${170 + offset}, 520 ${418 + offset}, 780 ${250 + offset} S 1160 ${96 + offset}, 1320 ${190 + offset}`}
            />
          );
        })}
      </g>
    </svg>
  );
}

/**
 * SkyGlow — a atmosfera do céu de Brasília aplicada a uma seção específica.
 * Usada no hero e no telão.
 */
export function SkyGlow({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        background:
          'radial-gradient(70% 110% at 18% 0%, rgb(1 105 233 / 0.34) 0%, transparent 60%), radial-gradient(52% 90% at 92% 10%, rgb(32 196 250 / 0.2) 0%, transparent 64%)',
      }}
    />
  );
}
