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
        <div className="mt-5 space-y-3 text-left text-sm text-white/55">
          <p className="font-display text-xs font-bold tracking-wider text-white/70 uppercase">
            O que costuma ser
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              As variáveis não foram preenchidas na Vercel — vá em{' '}
              <strong>Settings → Environment Variables</strong> e depois faça{' '}
              <strong>Redeploy</strong>.
            </li>
            <li>
              O banco ainda não foi instalado — rode{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-nacao-cyan">
                supabase/setup-completo.sql
              </code>{' '}
              no SQL Editor do Supabase.
            </li>
            <li>
              Rodando no seu computador? As variáveis vão no arquivo{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5">.env.local</code>.
            </li>
          </ul>
          <p className="text-white/40">
            Passo a passo completo em <strong>docs/colocar-no-ar.md</strong>.
          </p>
        </div>
      </div>
    </main>
  );
}
