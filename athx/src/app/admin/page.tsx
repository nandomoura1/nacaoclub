import Link from 'next/link';
import { ArrowRight, ClipboardList, Monitor, QrCode, Users } from 'lucide-react';
import { getSnapshot } from '@/services/leaderboard-service';
import { leaderboardDoSnapshot } from '@/lib/scoring/build';
import { capEmTexto } from '@/types/wod';
import { ADMIN_STATUSES } from '@/lib/scoring/eligibility';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EventErrorScreen } from '@/components/EventErrorScreen';
import type { Snapshot } from '@/services/snapshot';

export const dynamic = 'force-dynamic';

/** Painel — o mapa do dia do evento em uma tela só. */
export default async function AdminDashboard() {
  let snapshot: Snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (error) {
    return <EventErrorScreen message={error instanceof Error ? error.message : ''} />;
  }

  const publico = leaderboardDoSnapshot(snapshot);

  const previa = leaderboardDoSnapshot(snapshot, { statuses: ADMIN_STATUSES });

  // Um cartão por WOD do evento — três, cinco ou um, conforme o cadastro.
  const progresso = snapshot.wods.map((wod) => {
    const entradas = snapshot.entries.filter((e) => e.wodId === wod.id);
    return {
      wod,
      publicados: entradas.filter((e) => e.status === 'PUBLISHED' || e.status === 'LOCKED').length,
      rascunhos: entradas.filter((e) => e.status === 'DRAFT').length,
    };
  });

  const ativos = snapshot.teams.filter((t) => t.status !== 'DESCLASSIFICADA').length;
  const semNome = snapshot.teams.filter((t) => !t.athlete1.trim() || !t.athlete2.trim()).length;
  const empates = publico.standings.filter((r) => r.needsDecision).length;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
            {snapshot.event.name}
          </p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight uppercase">
            Painel
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={snapshot.event.liveMode ? 'ok' : 'neutral'}>
            {snapshot.event.liveMode ? 'Live mode ligado' : 'Live mode desligado'}
          </Badge>
          {snapshot.event.maintenanceMode ? (
            <Badge tone="danger">Manutenção ativa</Badge>
          ) : null}
        </div>
      </header>

      {/* ---- Fluxo do dia ------------------------------------------------- */}
      <section>
        <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-white/50 uppercase">
          Lançamento por WOD
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {progresso.map(({ wod, publicados, rascunhos }) => (
            <Link key={wod.id} href={`/admin/wod/${wod.numero}`} className="group">
              <Card className="flex h-full flex-col justify-between gap-4 p-5 transition-colors group-hover:bg-white/[0.08]">
                <div>
                  <p className="font-display text-[10px] font-bold tracking-kicker text-nacao-cyan uppercase">
                    {wod.nome}
                    {capEmTexto(wod.capSegundos) ? ` · CAP ${capEmTexto(wod.capSegundos)}` : ''}
                  </p>
                  <p className="mt-1 font-display text-2xl font-black uppercase">
                    WOD {wod.numero}
                  </p>
                </div>

                <div>
                  <p className="tnum font-display text-3xl font-black">
                    {publicados}
                    <span className="text-base text-white/35">/{ativos}</span>
                  </p>
                  <p className="font-display text-[10px] font-bold tracking-wider text-white/40 uppercase">
                    Publicados
                  </p>
                  {rascunhos > 0 ? (
                    <p className="mt-2">
                      <Badge tone="warn">{rascunhos} em rascunho</Badge>
                    </p>
                  ) : null}
                </div>

                <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-nacao-cyan uppercase">
                  Lançar resultados
                  <ArrowRight size={13} aria-hidden="true" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Situação ----------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Duplas ativas" value={String(ativos)} hint={`${snapshot.teams.length} cadastradas`} />
        <Stat
          label="Sem nome de atleta"
          value={String(semNome)}
          hint={semNome > 0 ? 'Complete em Duplas' : 'Tudo preenchido'}
          alerta={semNome > 0}
        />
        <Stat
          label="Empates a decidir"
          value={String(empates)}
          hint={empates > 0 ? 'Critério ainda não definido' : 'Nenhum'}
          alerta={empates > 0}
        />
        <Stat
          label="Prévia x público"
          value={previa.standings[0]?.team.teamName ?? '—'}
          hint={`Público: ${publico.standings[0]?.team.teamName ?? '—'}`}
        />
      </section>

      {/* ---- Atalhos ------------------------------------------------------ */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Atalho href="/admin/teams" label="Cadastrar duplas" Icon={Users} />
        <Atalho href="/admin/results" label="Conferência geral" Icon={ClipboardList} />
        <Atalho href="/display" label="Abrir telão" Icon={Monitor} externo />
        <Atalho href="/qr" label="QR Code do evento" Icon={QrCode} externo />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  alerta = false,
}: {
  label: string;
  value: string;
  hint?: string;
  alerta?: boolean;
}) {
  return (
    <Card className={`p-4 ${alerta ? 'border-amber-400/30' : ''}`}>
      <p className="font-display text-[10px] font-bold tracking-kicker text-white/40 uppercase">
        {label}
      </p>
      <p
        className={`tnum mt-1 truncate font-display text-2xl font-black ${
          alerta ? 'text-amber-300' : ''
        }`}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-[11px] text-white/40">{hint}</p> : null}
    </Card>
  );
}

function Atalho({
  href,
  label,
  Icon,
  externo = false,
}: {
  href: string;
  label: string;
  Icon: typeof Users;
  externo?: boolean;
}) {
  return (
    <Link
      href={href}
      target={externo ? '_blank' : undefined}
      rel={externo ? 'noreferrer' : undefined}
      className="surface flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.08]"
    >
      <Icon size={18} className="shrink-0 text-nacao-sky" aria-hidden="true" />
      <span className="font-display text-sm font-bold">{label}</span>
    </Link>
  );
}
