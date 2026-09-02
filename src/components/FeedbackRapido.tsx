'use client';

import { useState } from 'react';

/**
 * Feedback de um clique (seção 24).
 *
 * Meta explícita do brief: registrar algo em menos de cinco segundos.
 * Por isso não há confirmação, não há modal, não há formulário. O
 * professor toca e o registro está feito — o retorno visual é imediato
 * e otimista, e a lista recarrega em segundo plano.
 */

const FEEDBACKS = [
  { key: 'GREAT_SESSION', emoji: '👍', label: 'Treino foi ótimo' },
  { key: 'GREAT_EVOLUTION', emoji: '🔥', label: 'Evolução excelente' },
  { key: 'ACHIEVED_GOAL', emoji: '🏆', label: 'Conquistou objetivo' },
  { key: 'TALKED', emoji: '💬', label: 'Conversamos' },
  { key: 'NEEDS_ATTENTION', emoji: '⚠️', label: 'Precisa de atenção' },
  { key: 'GREAT_RELATIONSHIP', emoji: '❤️', label: 'Excelente relacionamento' },
  { key: 'IMPROVING', emoji: '📈', label: 'Evoluindo' },
] as const;

export function FeedbackRapido({
  studentId,
  primeiroNome,
  onRegistrado,
}: {
  studentId: string;
  primeiroNome: string;
  onRegistrado: () => void;
}) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  async function registrar(key: string) {
    setEnviando(key);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, key }),
      });
      if (res.ok) {
        setConfirmado(key);
        // A confirmação some sozinha: o professor não precisa fechar nada.
        setTimeout(() => setConfirmado(null), 2200);
        onRegistrado();
      }
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-borda bg-white p-5">
      <h2 className="font-titulo mb-1 text-[15px] font-bold text-navy">FEEDBACK RÁPIDO</h2>
      <p className="mb-4 text-[12px] text-tinta-fraca">
        Um toque e fica registrado no histórico de {primeiroNome}.
      </p>

      <div className="flex flex-wrap gap-2">
        {FEEDBACKS.map((f) => (
          <button
            key={f.key}
            onClick={() => registrar(f.key)}
            disabled={enviando !== null}
            className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition disabled:opacity-60 ${
              confirmado === f.key
                ? 'border-sucesso bg-sucesso/10 text-sucesso'
                : 'border-borda bg-white text-tinta-suave hover:border-nacao hover:text-nacao'
            }`}
          >
            {confirmado === f.key ? '✓ Registrado' : `${f.emoji} ${f.label}`}
          </button>
        ))}
      </div>
    </section>
  );
}
