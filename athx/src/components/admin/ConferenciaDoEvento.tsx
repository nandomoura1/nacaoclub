import Link from 'next/link';
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import type { Achado } from '@/lib/evento/conferencia';
import { Card } from '@/components/ui/Card';

/**
 * O que está torto na configuração, antes de o evento começar.
 *
 * Fica no alto do painel de propósito: um problema de configuração não dá
 * erro nenhum durante o evento — ele decide o pódio em silêncio e só
 * aparece quando alguém reclama do resultado.
 *
 * Quando não há nada a apontar, o bloco não ocupa espaço com uma lista
 * vazia: vira uma linha discreta dizendo que está tudo conferido.
 */
export function ConferenciaDoEvento({ achados }: { achados: readonly Achado[] }) {
  if (achados.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-emerald-300/80">
        <CheckCircle2 size={15} className="shrink-0" />
        Configuração conferida: WODs, provas e critério de desempate estão coerentes.
      </p>
    );
  }

  const erros = achados.filter((a) => a.gravidade === 'ERRO');

  return (
    <Card
      className={`space-y-3 p-4 ${
        erros.length > 0 ? 'border-red-400/30 bg-red-500/[0.07]' : 'border-amber-400/25 bg-amber-400/[0.06]'
      }`}
    >
      <p className="font-display text-[11px] font-bold tracking-wider uppercase">
        Conferência da configuração
        <span className="ml-2 font-normal text-white/50 normal-case">
          {erros.length > 0
            ? `${erros.length} ${erros.length === 1 ? 'problema' : 'problemas'} a resolver`
            : `${achados.length} ${achados.length === 1 ? 'ponto' : 'pontos'} de atenção`}
        </span>
      </p>

      <ul className="space-y-2.5">
        {achados.map((a, i) => (
          <li key={i} className="flex items-start gap-2.5">
            {a.gravidade === 'ERRO' ? (
              <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-300" />
            ) : (
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <span className="min-w-0 text-[13px]">
              <strong className="font-display font-bold">{a.titulo}</strong>
              <span className="mt-0.5 block text-white/60">{a.comoResolver}</span>
              {a.onde ? (
                <Link
                  href={a.onde}
                  className="mt-1 inline-block font-display text-[11px] font-bold tracking-wider text-nacao-cyan uppercase hover:underline"
                >
                  Corrigir →
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
