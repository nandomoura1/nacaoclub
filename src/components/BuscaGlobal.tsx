'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from './Avatar';
import { ultimaVisita } from '@/lib/format';

type Resultado = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  planName: string | null;
  modalities: string[];
  lastSeenAt: string | null;
};

/**
 * Busca global (seção 29).
 *
 * Debounce de 250ms: rápido o suficiente para parecer instantâneo, folgado
 * o bastante para não disparar uma consulta por tecla digitada.
 */
export function BuscaGlobal() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }

    setBuscando(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(termo)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setResultados(data.results ?? []);
        }
      } catch {
        // Requisição cancelada por nova digitação. Silencioso de propósito.
      } finally {
        setBuscando(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [termo]);

  // Fecha ao clicar fora — comportamento esperado de qualquer overlay.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Buscar aluno"
        className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/10"
      >
        🔍 Buscar
      </button>

      {aberto && (
        <div className="absolute top-full right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-xl border border-borda bg-white shadow-[0_16px_44px_-12px_rgba(2,43,87,0.4)]">
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
            placeholder="Nome ou ID do aluno…"
            className="w-full border-b border-borda px-4 py-3 text-[14px] text-tinta outline-none"
          />

          <div className="scroll-fino max-h-[340px] overflow-y-auto">
            {termo.trim().length < 2 ? (
              <p className="px-4 py-6 text-center text-[12px] text-tinta-fraca">
                Digite ao menos 2 caracteres
              </p>
            ) : buscando && resultados.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-tinta-fraca">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-tinta-fraca">
                Nenhum aluno encontrado
              </p>
            ) : (
              <ul>
                {resultados.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setAberto(false);
                        setTermo('');
                        router.push(`/alunos/${r.id}`);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-fundo"
                    >
                      <Avatar nome={r.fullName} photoUrl={r.photoUrl} tamanho={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-navy">
                          {r.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-tinta-fraca">
                          {r.planName ?? 'Plano não informado'} · {ultimaVisita(r.lastSeenAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
