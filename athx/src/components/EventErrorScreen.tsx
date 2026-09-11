import { AlertTriangle } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * Falha ao carregar o evento — normalmente Supabase não configurado.
 * A mensagem técnica aparece porque quem vê isso é quem está montando o
 * ambiente, não o público do dia do evento.
 */
export function EventErrorScreen({ message }: { message?: string }) {
  return (
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <BrandLogo size="lg" />
      <AlertTriangle size={26} className="text-amber-300" aria-hidden="true" />
      <div className="max-w-lg">
        <h1 className="font-display text-2xl font-black uppercase">
          Não foi possível carregar o evento
        </h1>
        {message ? (
          <p className="mt-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-left text-xs text-white/65">
            {message}
          </p>
        ) : null}
        <p className="mt-4 text-sm text-white/50">
          Para avaliar a aplicação sem banco, defina{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-nacao-cyan">
            NEXT_PUBLIC_DEMO_MODE=true
          </code>{' '}
          no <code className="rounded bg-white/10 px-1.5 py-0.5">.env.local</code>.
        </p>
      </div>
    </main>
  );
}
