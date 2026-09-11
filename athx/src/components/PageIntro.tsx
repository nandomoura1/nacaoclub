import { WaveField, SkyGlow } from '@/components/WaveField';

/**
 * Cabeçalho de página interna. Mesma construção do hero (kicker / título /
 * filete + subtítulo em tracking largo), em escala menor.
 */
export function PageIntro({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.08]">
      <SkyGlow />
      <WaveField intensity="subtle" />
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
          {kicker}
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.035em] uppercase sm:text-5xl">
          {title}
        </h1>
        {subtitle ? (
          <div className="mt-2.5 flex items-center gap-3">
            <span className="h-px w-8 bg-nacao-cyan" aria-hidden="true" />
            <p className="font-display text-[10px] font-bold tracking-signature text-white/70 uppercase">
              {subtitle}
            </p>
          </div>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </section>
  );
}
