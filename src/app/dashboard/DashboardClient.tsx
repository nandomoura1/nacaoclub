'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/Avatar';
import { horaComSegundos, horaCurta } from '@/lib/format';
import { BuscaGlobal } from '@/components/BuscaGlobal';

type Catraca = { id: string; name: string; location: string | null };

type Chegada = {
  id: string;
  occurredAt: string;
  turnstile: { id: string | null; name: string } | null;
  student: {
    id: string;
    fullName: string;
    firstName: string | null;
    photoUrl: string | null;
    planName: string | null;
    modalities: string[];
  };
  last30Days: number;
  isFirstVisit: boolean;
  isFrequent: boolean;
  latestNote: { category: string; content: string } | null;
  alertCount: number;
};

type Feed = {
  turnstiles: Catraca[];
  stats: { entries: number; distinctStudents: number; newStudents: number; openAlerts: number };
  arrivals: Chegada[];
  sync: { lastOkAt: string | null; failureCount: number };
  serverTime: string;
};

type Conexao = 'online' | 'sincronizando' | 'offline';

export function DashboardClient({
  usuario,
  catracaInicial,
  catracas,
}: {
  usuario: { id: string; nome: string; papel: string };
  catracaInicial: string | null;
  catracas: Catraca[];
}) {
  const router = useRouter();
  const [catracaId, setCatracaId] = useState<string | null>(catracaInicial);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [conexao, setConexao] = useState<Conexao>('sincronizando');
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [novos, setNovos] = useState<Set<string>>(new Set());

  // Guarda o filtro atual para o handler do SSE, que é criado uma vez só
  // e não deve ser recriado a cada troca de catraca.
  const catracaRef = useRef(catracaId);
  catracaRef.current = catracaId;

  const carregarFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('turnstileId', catracaRef.current ?? 'all');
      const res = await fetch(`/api/dashboard/feed?${params}`, { cache: 'no-store' });

      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setConexao('offline');
        return;
      }

      setFeed(await res.json());
      setAtualizadoEm(new Date());
      setConexao('online');
    } catch {
      setConexao('offline');
    }
  }, [router]);

  // Recarrega ao trocar de catraca.
  useEffect(() => {
    setConexao('sincronizando');
    void carregarFeed();
  }, [catracaId, carregarFeed]);

  // Assinatura SSE. O filtro vai na URL: o servidor só envia o que é
  // relevante para esta catraca — o cliente não precisa filtrar nada.
  useEffect(() => {
    const url = `/api/dashboard/stream?turnstileId=${catracaId ?? 'all'}`;
    const source = new EventSource(url);

    source.addEventListener('ready', () => setConexao('online'));

    source.addEventListener('arrival', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { accessEventId: string };
      // Marca para animar; o feed completo vem da rota, que já traz
      // contexto, nota e alertas prontos.
      setNovos((prev) => new Set(prev).add(payload.accessEventId));
      void carregarFeed();
      // A marcação de "novo" dura o tempo da animação e some sozinha.
      setTimeout(() => {
        setNovos((prev) => {
          const next = new Set(prev);
          next.delete(payload.accessEventId);
          return next;
        });
      }, 4000);
    });

    source.addEventListener('heartbeat', () => {
      setAtualizadoEm(new Date());
      setConexao('online');
    });

    source.addEventListener('sync', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { status: string };
      setConexao(payload.status === 'ok' ? 'online' : 'offline');
      setAtualizadoEm(new Date());
    });

    // O EventSource reconecta sozinho; só refletimos o estado na tela.
    source.onerror = () => setConexao('offline');

    return () => source.close();
  }, [catracaId, carregarFeed]);

  const mostrarOrigem = catracaId === null;

  return (
    <div className="min-h-screen bg-fundo">
      <Cabecalho
        usuario={usuario}
        catracas={catracas}
        catracaId={catracaId}
        onTrocarCatraca={setCatracaId}
        conexao={conexao}
        atualizadoEm={atualizadoEm}
      />

      <main className="mx-auto max-w-[1180px] px-5 pb-16">
        <Indicadores stats={feed?.stats} />

        <section className="mt-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-titulo text-[19px] font-bold text-navy">ENTRARAM AGORA</h2>
            {feed && (
              <span className="text-[12px] text-tinta-fraca">
                {feed.arrivals.length} entrada{feed.arrivals.length === 1 ? '' : 's'} recente
                {feed.arrivals.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {!feed ? (
            <EsqueletoLista />
          ) : feed.arrivals.length === 0 ? (
            <Vazio catracaSelecionada={catracas.find((c) => c.id === catracaId)?.name ?? null} />
          ) : (
            <ul className="grid gap-3">
              {feed.arrivals.map((chegada) => (
                <li key={chegada.id}>
                  <CardAluno
                    chegada={chegada}
                    novo={novos.has(chegada.id)}
                    mostrarOrigem={mostrarOrigem}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

// ------------------------------------------------------------

function Cabecalho({
  usuario,
  catracas,
  catracaId,
  onTrocarCatraca,
  conexao,
  atualizadoEm,
}: {
  usuario: { nome: string; papel: string };
  catracas: Catraca[];
  catracaId: string | null;
  onTrocarCatraca: (id: string | null) => void;
  conexao: Conexao;
  atualizadoEm: Date | null;
}) {
  const router = useRouter();

  async function sair() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="gradiente-nacao relative overflow-hidden">
      {/* Onda no cabeçalho: elemento gráfico da marca, sutil, atrás do conteúdo */}
      <svg
        className="pointer-events-none absolute -bottom-6 left-0 w-full min-w-[900px] opacity-25"
        viewBox="0 0 1200 140"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 90c150-45 300-45 450 0s300 45 450 0 300-45 300 0v50H0z" fill="#20C4FA" opacity="0.5" />
      </svg>

      <div className="relative mx-auto max-w-[1180px] px-5 pt-5 pb-7">
        <div className="flex items-center justify-between gap-4">
          <Logo variant="claro" />
          <div className="flex items-center gap-3">
            <BuscaGlobal />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] leading-tight font-semibold text-white">{usuario.nome}</p>
              <p className="text-[11px] tracking-wide text-white/50 uppercase">{usuario.papel}</p>
            </div>
            <button
              onClick={sair}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-titulo text-[32px] leading-none font-extrabold text-white sm:text-[38px]">
              QUEM CHEGOU<span className="text-ciano">?</span>
            </h1>
            <p className="mt-2 text-[12px] tracking-[0.2em] text-white/55 uppercase">
              Conheça · Conecte · Cuide
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SeletorCatraca catracas={catracas} valor={catracaId} onChange={onTrocarCatraca} />
            <StatusConexao conexao={conexao} atualizadoEm={atualizadoEm} />
          </div>
        </div>
      </div>
    </header>
  );
}

function SeletorCatraca({
  catracas,
  valor,
  onChange,
}: {
  catracas: Catraca[];
  valor: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Catraca</span>
      <select
        value={valor ?? 'all'}
        onChange={(e) => onChange(e.target.value === 'all' ? null : e.target.value)}
        className="font-titulo cursor-pointer rounded-lg border border-white/25 bg-white/12 px-3.5 py-2.5 text-[13px] font-semibold text-white backdrop-blur-sm transition outline-none hover:bg-white/18 focus:border-ciano"
      >
        {/* "Todas" só faz sentido quando há mais de uma catraca autorizada */}
        {catracas.length > 1 && (
          <option value="all" className="text-tinta">
            Todas as catracas
          </option>
        )}
        {catracas.map((c) => (
          <option key={c.id} value={c.id} className="text-tinta">
            {c.name}
          </option>
        ))}
        {catracas.length === 0 && (
          <option value="all" className="text-tinta">
            Nenhuma catraca disponível
          </option>
        )}
      </select>
    </label>
  );
}

function StatusConexao({ conexao, atualizadoEm }: { conexao: Conexao; atualizadoEm: Date | null }) {
  const config = {
    online: { cor: 'bg-ciano', texto: 'ONLINE', classe: 'text-ciano' },
    sincronizando: { cor: 'bg-azul-claro', texto: 'SINCRONIZANDO', classe: 'text-azul-claro' },
    offline: { cor: 'bg-amber-400', texto: 'CONEXÃO INDISPONÍVEL', classe: 'text-amber-300' },
  }[conexao];

  return (
    <div className="flex flex-col items-start gap-0.5" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${config.cor} ${conexao === 'online' ? 'pulso' : ''}`} />
        <span className={`text-[11px] font-bold tracking-wider ${config.classe}`}>{config.texto}</span>
      </span>
      <span className="text-[10px] text-white/45">
        {atualizadoEm ? `Última atualização: ${horaComSegundos(atualizadoEm)}` : 'Conectando…'}
      </span>
    </div>
  );
}

function Indicadores({ stats }: { stats?: Feed['stats'] }) {
  const itens = [
    { rotulo: 'Entradas hoje', valor: stats?.entries, destaque: false },
    { rotulo: 'Alunos distintos', valor: stats?.distinctStudents, destaque: false },
    { rotulo: 'Novos alunos', valor: stats?.newStudents, destaque: false },
    { rotulo: 'Alertas', valor: stats?.openAlerts, destaque: (stats?.openAlerts ?? 0) > 0 },
  ];

  return (
    <div className="relative z-10 -mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((item) => (
        <div
          key={item.rotulo}
          className="rounded-xl border border-borda bg-white px-4 py-3.5 shadow-[0_2px_10px_-4px_rgba(2,43,87,0.15)]"
        >
          <p className="text-[11px] font-semibold tracking-wide text-tinta-fraca uppercase">
            {item.rotulo}
          </p>
          <p
            className={`font-titulo mt-1 text-[30px] leading-none font-extrabold ${
              item.destaque ? 'text-atencao' : 'text-navy'
            }`}
          >
            {item.valor ?? '—'}
          </p>
        </div>
      ))}
    </div>
  );
}

function CardAluno({
  chegada,
  novo,
  mostrarOrigem,
}: {
  chegada: Chegada;
  novo: boolean;
  mostrarOrigem: boolean;
}) {
  const { student: aluno } = chegada;

  return (
    <Link
      href={`/alunos/${aluno.id}`}
      className={`block rounded-xl border border-borda bg-white p-4 transition hover:border-azul-claro hover:shadow-[0_6px_20px_-8px_rgba(1,105,233,0.35)] ${
        novo ? 'animar-entrada destaque-novo' : ''
      }`}
    >
      <div className="flex items-start gap-4">
        <Avatar nome={aluno.fullName} photoUrl={aluno.photoUrl} tamanho={58} />

        <div className="min-w-0 flex-1">
          {/* Nível 1 da hierarquia visual: quem entrou */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-titulo truncate text-[19px] leading-tight font-bold text-navy">
              {aluno.fullName}
            </h3>
            {novo && (
              <span className="rounded-full bg-ciano/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-nacao uppercase">
                ● Entrou agora
              </span>
            )}
            {chegada.isFirstVisit && (
              <span className="rounded-full bg-sucesso/12 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sucesso uppercase">
                🆕 Novo aluno
              </span>
            )}
            {chegada.alertCount > 0 && (
              <span className="rounded-full bg-atencao/12 px-2 py-0.5 text-[10px] font-bold tracking-wide text-atencao uppercase">
                ⚠ {chegada.alertCount} alerta{chegada.alertCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Nível 2: o que preciso saber */}
          <p className="mt-1 truncate text-[13px] text-tinta-suave">
            {[aluno.planName, aluno.modalities.join(' + ')].filter(Boolean).join(' · ') ||
              'Plano não informado'}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            {chegada.isFrequent && (
              <span className="font-semibold text-nacao">
                🔥 {chegada.last30Days} acessos nos últimos 30 dias
              </span>
            )}
            {mostrarOrigem && chegada.turnstile && (
              <span className="font-semibold tracking-wide text-tinta-fraca uppercase">
                {chegada.turnstile.name}
              </span>
            )}
          </div>

          {/* Nível 3: como posso atendê-lo */}
          {chegada.latestNote && (
            <p className="mt-2.5 line-clamp-2 rounded-lg bg-fundo px-3 py-2 text-[13px] text-tinta-suave">
              💬 {chegada.latestNote.content}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="font-titulo text-[21px] leading-none font-bold text-navy">
            {horaCurta(chegada.occurredAt)}
          </p>
          <p className="mt-2 text-[11px] font-semibold text-nacao">VER PERFIL →</p>
        </div>
      </div>
    </Link>
  );
}

function Vazio({ catracaSelecionada }: { catracaSelecionada: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-borda bg-white/60 px-6 py-14 text-center">
      <p className="font-titulo text-[17px] font-bold text-navy">Nenhuma entrada por aqui ainda</p>
      <p className="mt-1.5 text-[13px] text-tinta-fraca">
        {catracaSelecionada
          ? `Assim que alguém passar pela ${catracaSelecionada}, aparece nesta tela.`
          : 'Assim que alguém passar pela catraca, aparece nesta tela.'}
      </p>
    </div>
  );
}

function EsqueletoLista() {
  return (
    <ul className="grid gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-[104px] animate-pulse rounded-xl border border-borda bg-white/70" />
      ))}
    </ul>
  );
}
