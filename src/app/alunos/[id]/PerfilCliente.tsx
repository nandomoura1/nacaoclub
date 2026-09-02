'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Logo } from '@/components/Logo';
import { ModalNota } from '@/components/ModalNota';
import { FeedbackRapido } from '@/components/FeedbackRapido';
import { dataCurta, horaCurta, primeiroNome, tempoComoAluno, ultimaVisita } from '@/lib/format';

type Perfil = {
  student: {
    id: string;
    tecnofitStudentId: string;
    fullName: string;
    firstName: string | null;
    photoUrl: string | null;
    status: string;
    planName: string | null;
    modalities: string[];
    memberSince: string | null;
    membershipMonths: number | null;
    planExpiresAt: string | null;
  };
  frequency: {
    last7Days: number;
    last30Days: number;
    weeklyAverage: number;
    lastVisitAt: string | null;
    totalTracked: number;
    byTurnstile: Array<{ turnstileId: string | null; name: string; count: number }>;
  };
  history: Array<{
    id: string;
    occurredAt: string;
    turnstileName: string | null;
    modality: string | null;
  }>;
  timeline: Array<
    | {
        kind: 'note';
        id: string;
        at: string;
        category: string;
        content: string;
        author: string;
        authorId: string;
        editedAt: string | null;
      }
    | {
        kind: 'event';
        id: string;
        at: string;
        type: string;
        label: string | null;
        emoji: string | null;
        author: string;
        authorId: string;
      }
  >;
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    guidance: string | null;
    createdAt: string;
  }>;
};

const CATEGORIA_LABEL: Record<string, { label: string; emoji: string }> = {
  OBJETIVO: { label: 'Objetivo', emoji: '🎯' },
  PREFERENCIA: { label: 'Preferência', emoji: '⭐' },
  TREINAMENTO: { label: 'Treinamento', emoji: '🏋️' },
  RELACIONAMENTO: { label: 'Relacionamento', emoji: '💬' },
  ATENDIMENTO: { label: 'Atendimento', emoji: '🤝' },
  COMERCIAL: { label: 'Comercial', emoji: '📋' },
  EVENTO: { label: 'Evento', emoji: '📅' },
  CONQUISTA: { label: 'Conquista', emoji: '🏆' },
  FEEDBACK: { label: 'Feedback', emoji: '📈' },
  OUTRO: { label: 'Outro', emoji: '📝' },
};

export function PerfilCliente({
  studentId,
  usuarioId,
  papel,
}: {
  studentId: string;
  usuarioId: string;
  papel: string;
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/${studentId}`, { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error ?? 'Não foi possível carregar o perfil.');
        return;
      }
      setPerfil(await res.json());
      setErro(null);
    } catch {
      setErro('Falha de conexão.');
    }
  }, [studentId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <Moldura>
        <p className="rounded-xl border border-critico/20 bg-critico/5 px-5 py-8 text-center text-critico">
          {erro}
        </p>
      </Moldura>
    );
  }

  if (!perfil) {
    return (
      <Moldura>
        <div className="h-40 animate-pulse rounded-xl border border-borda bg-white/70" />
      </Moldura>
    );
  }

  const { student: aluno, frequency: freq } = perfil;
  const maxModalidade = Math.max(1, ...freq.byTurnstile.map((t) => t.count));

  return (
    <Moldura>
      {/* ---------- ALERTAS: primeiro, porque mudam a abordagem ---------- */}
      {perfil.alerts.length > 0 && (
        <section className="mb-5">
          <h2 className="font-titulo mb-2 text-[13px] font-bold tracking-wide text-atencao uppercase">
            Atenção
          </h2>
          <ul className="grid gap-2">
            {perfil.alerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border px-4 py-3 ${
                  a.severity === 'CRITICAL'
                    ? 'border-critico/25 bg-critico/5'
                    : a.severity === 'ATTENTION'
                      ? 'border-atencao/25 bg-atencao/5'
                      : 'border-borda bg-white'
                }`}
              >
                <p className="text-[14px] font-semibold text-navy">{a.message}</p>
                {a.guidance && <p className="mt-1 text-[13px] text-tinta-suave">{a.guidance}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- RESUMO ---------- */}
      <section className="rounded-2xl border border-borda bg-white p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar nome={aluno.fullName} photoUrl={aluno.photoUrl} tamanho={88} />

          <div className="min-w-[220px] flex-1">
            <h1 className="font-titulo text-[27px] leading-tight font-extrabold text-navy">
              {aluno.fullName}
            </h1>
            <p className="mt-1 text-[13px] text-tinta-suave">
              {aluno.status === 'ACTIVE' ? 'Aluno ativo' : `Status: ${aluno.status}`}
              {aluno.planName ? ` · ${aluno.planName}` : ''}
            </p>
            {aluno.modalities.length > 0 && (
              <p className="mt-1 text-[14px] font-semibold text-nacao">
                {aluno.modalities.join(' + ')}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setModalAberto(true)}
              className="font-titulo rounded-lg bg-nacao px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-nacao-600"
            >
              + ADICIONAR NOTA
            </button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-borda pt-5 sm:grid-cols-4">
          <Dado rotulo="Aluno há" valor={tempoComoAluno(aluno.membershipMonths)} />
          <Dado rotulo="Acessos (30 dias)" valor={String(freq.last30Days)} />
          <Dado rotulo="Última visita" valor={ultimaVisita(freq.lastVisitAt)} />
          <Dado
            rotulo="Modalidade principal"
            valor={freq.byTurnstile[0]?.name ?? 'Não informado'}
          />
        </dl>
      </section>

      {/* ---------- FEEDBACK RÁPIDO ---------- */}
      <FeedbackRapido
        studentId={aluno.id}
        primeiroNome={primeiroNome(aluno.fullName, aluno.firstName)}
        onRegistrado={carregar}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* ---------- RELACIONAMENTO ---------- */}
        <section className="self-start rounded-2xl border border-borda bg-white p-5">
          <h2 className="font-titulo mb-4 text-[15px] font-bold text-navy">RELACIONAMENTO</h2>

          {perfil.timeline.length === 0 ? (
            <p className="rounded-lg bg-fundo px-4 py-8 text-center text-[13px] text-tinta-fraca">
              Ainda não há registros. A primeira observação sobre este aluno começa com você.
            </p>
          ) : (
            <ol className="relative space-y-4 border-l border-borda pl-5">
              {perfil.timeline.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="relative">
                  <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full bg-azul-claro ring-3 ring-white" />

                  <p className="text-[11px] text-tinta-fraca">
                    {dataCurta(item.at)} · {item.author}
                    {item.kind === 'note' && item.editedAt && ' · editada'}
                  </p>

                  {item.kind === 'note' ? (
                    <>
                      <p className="mt-0.5 text-[11px] font-bold tracking-wide text-nacao uppercase">
                        {CATEGORIA_LABEL[item.category]?.emoji} {CATEGORIA_LABEL[item.category]?.label ?? item.category}
                      </p>
                      <p className="mt-1 text-[14px] text-tinta">{item.content}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-[14px] text-tinta">
                      {item.emoji} {item.label ?? item.type}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="grid gap-5">
          {/* ---------- FREQUÊNCIA ---------- */}
          <section className="rounded-2xl border border-borda bg-white p-5">
            <h2 className="font-titulo mb-4 text-[15px] font-bold text-navy">FREQUÊNCIA</h2>

            <Barra rotulo="Últimos 7 dias" valor={freq.last7Days} max={7} />
            <Barra rotulo="Últimos 30 dias" valor={freq.last30Days} max={30} />

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-borda pt-4">
              <Dado rotulo="Média semanal" valor={`${freq.weeklyAverage.toString().replace('.', ',')}x`} />
              <Dado rotulo="Total registrado" valor={String(freq.totalTracked)} />
            </div>
          </section>

          {/* ---------- MODALIDADES ---------- */}
          <section className="rounded-2xl border border-borda bg-white p-5">
            <h2 className="font-titulo mb-4 text-[15px] font-bold text-navy">MODALIDADES</h2>

            {freq.byTurnstile.length === 0 ? (
              <p className="text-[13px] text-tinta-fraca">
                Sem acessos registrados nos últimos 90 dias.
              </p>
            ) : (
              <ul className="space-y-3">
                {freq.byTurnstile.slice(0, 6).map((m) => (
                  <li key={m.turnstileId ?? m.name}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="text-tinta">{m.name}</span>
                      <span className="font-semibold text-tinta-fraca">{m.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-fundo">
                      <div
                        className="h-full rounded-full bg-nacao"
                        style={{ width: `${(m.count / maxModalidade) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ---------- HISTÓRICO DE ACESSOS ---------- */}
      <section className="mt-5 rounded-2xl border border-borda bg-white p-5">
        <h2 className="font-titulo mb-4 text-[15px] font-bold text-navy">HISTÓRICO DE ACESSOS</h2>

        {perfil.history.length === 0 ? (
          <p className="text-[13px] text-tinta-fraca">Nenhum acesso registrado.</p>
        ) : (
          <div className="scroll-fino max-h-[340px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-borda text-left text-[11px] tracking-wide text-tinta-fraca uppercase">
                  <th className="pb-2 font-semibold">Data</th>
                  <th className="pb-2 font-semibold">Horário</th>
                  <th className="pb-2 font-semibold">Catraca</th>
                  <th className="pb-2 font-semibold">Modalidade</th>
                </tr>
              </thead>
              <tbody>
                {perfil.history.map((h) => (
                  <tr key={h.id} className="border-b border-borda/60 last:border-0">
                    <td className="py-2 text-tinta">{dataCurta(h.occurredAt)}</td>
                    <td className="py-2 text-tinta">{horaCurta(h.occurredAt)}</td>
                    <td className="py-2 text-tinta-suave">{h.turnstileName ?? '—'}</td>
                    <td className="py-2 text-tinta-suave">{h.modality ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto && (
        <ModalNota
          studentId={aluno.id}
          onFechar={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false);
            void carregar();
          }}
        />
      )}
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fundo">
      <header className="gradiente-nacao">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4">
          <Logo variant="claro" />
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-white/85 transition hover:bg-white/10"
          >
            ← Quem chegou?
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-6 pb-16">{children}</main>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-tinta-fraca uppercase">{rotulo}</dt>
      <dd className="font-titulo mt-0.5 text-[16px] font-bold text-navy">{valor}</dd>
    </div>
  );
}

function Barra({ rotulo, valor, max }: { rotulo: string; valor: number; max: number }) {
  const pct = Math.min(100, (valor / max) * 100);
  return (
    <div className="mb-3.5">
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-tinta-suave">{rotulo}</span>
        <span className="font-titulo font-bold text-navy">{valor}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-fundo">
        <div className="h-full rounded-full bg-linear-to-r from-nacao to-ciano" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
