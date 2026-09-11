import { Wrench } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { WaveField } from '@/components/WaveField';

/**
 * MAINTENANCE MODE (§41) — a organização precisou fechar o acesso público
 * por alguns minutos. Tela honesta, sem erro técnico na cara do público.
 */
export function MaintenanceScreen() {
  return (
    <main
      id="conteudo"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <WaveField intensity="normal" />
      <div className="relative flex flex-col items-center gap-6">
        <BrandLogo size="lg" />
        <Wrench size={26} className="text-nacao-cyan" aria-hidden="true" />
        <div>
          <h1 className="font-display text-2xl font-black uppercase sm:text-4xl">
            Leaderboard em manutenção
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/55">
            A organização está conferindo os resultados. Em instantes a classificação
            volta ao ar — esta página se atualiza sozinha.
          </p>
        </div>
        <p className="font-display text-[10px] tracking-signature text-white/35 uppercase">
          Nação Celebration
        </p>
      </div>
    </main>
  );
}
