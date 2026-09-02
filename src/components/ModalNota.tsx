'use client';

import { useEffect, useState } from 'react';

/**
 * Modal de nota de relacionamento (seção 21).
 *
 * Regra de UX: categoria em um toque, texto em um campo, salvar. Sem
 * campos opcionais, sem etapas. O professor não pode virar operador
 * de sistema — ele tem que voltar para a quadra.
 */

const CATEGORIAS = [
  { valor: 'OBJETIVO', label: 'Objetivo', emoji: '🎯' },
  { valor: 'PREFERENCIA', label: 'Preferência', emoji: '⭐' },
  { valor: 'TREINAMENTO', label: 'Treinamento', emoji: '🏋️' },
  { valor: 'RELACIONAMENTO', label: 'Relacionamento', emoji: '💬' },
  { valor: 'ATENDIMENTO', label: 'Atendimento', emoji: '🤝' },
  { valor: 'COMERCIAL', label: 'Comercial', emoji: '📋' },
  { valor: 'EVENTO', label: 'Evento', emoji: '📅' },
  { valor: 'CONQUISTA', label: 'Conquista', emoji: '🏆' },
  { valor: 'FEEDBACK', label: 'Feedback', emoji: '📈' },
  { valor: 'OUTRO', label: 'Outro', emoji: '📝' },
] as const;

const MAX = 1000;

export function ModalNota({
  studentId,
  onFechar,
  onSalvo,
}: {
  studentId: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [categoria, setCategoria] = useState<string>('RELACIONAMENTO');
  const [conteudo, setConteudo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, category: categoria, content: conteudo }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? 'Não foi possível salvar.');
        return;
      }
      onSalvo();
    } catch {
      setErro('Falha de conexão.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 px-4 backdrop-blur-[2px]"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar nota de relacionamento"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-[0_24px_60px_-16px_rgba(2,43,87,0.55)]"
      >
        <h2 className="font-titulo text-[19px] font-bold text-navy">
          Conte algo importante sobre este aluno…
        </h2>
        <p className="mt-1 text-[12px] text-tinta-fraca">
          Registre apenas informações relevantes para melhorar a experiência do aluno.
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setCategoria(c.valor)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                categoria === c.valor
                  ? 'border-nacao bg-nacao text-white'
                  : 'border-borda bg-white text-tinta-suave hover:border-azul-claro'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <textarea
          autoFocus
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value.slice(0, MAX))}
          rows={4}
          placeholder="Ex.: Está treinando para o campeonato de futevôlei em novembro."
          className="mt-4 w-full resize-none rounded-lg border border-borda px-3.5 py-3 text-[14px] text-tinta outline-none transition focus:border-nacao focus:ring-2 focus:ring-nacao/15"
        />

        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-tinta-fraca">
            Autoria e data ficam registradas automaticamente.
          </span>
          <span className="text-[11px] text-tinta-fraca">
            {conteudo.length}/{MAX}
          </span>
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-critico/5 px-3 py-2 text-[13px] text-critico">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-borda px-4 py-2.5 text-[13px] font-semibold text-tinta-suave transition hover:bg-fundo"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || conteudo.trim().length < 3}
            className="font-titulo rounded-lg bg-nacao px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-nacao-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar nota'}
          </button>
        </div>
      </form>
    </div>
  );
}
