'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import type { DnfPolicy, EventSettings, TieBreaker, TiePointsMode } from '@/types/domain';
import { TIE_BREAKERS, TIE_BREAKER_LABEL } from '@/types/domain';
import { salvarConfiguracoes } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';

const TIE_MODES: { value: TiePointsMode; titulo: string; descricao: string }[] = [
  {
    value: 'COMPETITION',
    titulo: 'Posição repetida (1º, 1º, 3º)',
    descricao:
      'Duas duplas com o MESMO resultado recebem a mesma posição e os mesmos pontos; a próxima cai para 3º. É o padrão esportivo mais comum.',
  },
  {
    value: 'AVERAGE',
    titulo: 'Média das posições (1,5 · 1,5 · 3)',
    descricao:
      'As duplas empatadas dividem a média das posições que ocupariam. Distribui os pontos de forma mais suave.',
  },
];

const DNF_POLICIES: { value: DnfPolicy; titulo: string; descricao: string }[] = [
  {
    value: 'PENDING_DEFINITION',
    titulo: 'Decisão manual (padrão)',
    descricao:
      'Quem não concluiu fica atrás de todos que concluíram, empatado com os demais incompletos e marcado para decisão da organização. NENHUM critério é assumido.',
  },
  {
    value: 'VOLUME_DESC',
    titulo: 'Maior volume concluído na frente',
    descricao:
      'Entre os incompletos, quem fez mais volume dentro do CAP fica melhor colocado.',
  },
  {
    value: 'TIED_LAST',
    titulo: 'Todos na última posição',
    descricao: 'Todos os incompletos ocupam a última colocação do WOD, empatados.',
  },
];

/**
 * Configurações do evento (§15, §26, §41, §48).
 *
 * Esta tela existe porque algumas regras AINDA NÃO FORAM FECHADAS pela
 * organização. Em vez de o sistema inventar, ele pergunta — e deixa a
 * escolha explícita, auditável e reversível.
 */
export function SettingsForm({ settings }: { settings: EventSettings }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [form, setForm] = useState<EventSettings>(settings);
  const [aviso, setAviso] = useState<ActionResult | null>(null);

  function salvar() {
    setAviso(null);
    startTransition(async () => {
      const resultado = await salvarConfiguracoes(form);
      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {aviso ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            aviso.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.message}
        </p>
      ) : null}

      {/* ---- Operação ----------------------------------------------------- */}
      <Card className="p-5">
        <CardHeader kicker="§41 Modo de operação" title="Live e manutenção" />

        <div className="mt-4 space-y-3">
          <Toggle
            label="LIVE MODE"
            descricao="Liga o indicador AO VIVO, as atualizações em tempo real e o carimbo de horário no leaderboard público."
            checked={form.liveMode}
            onChange={(v) => setForm({ ...form, liveMode: v })}
          />
          <Toggle
            label="MAINTENANCE MODE"
            descricao="Fecha o acesso público temporariamente. Quem entrar vê uma tela de manutenção em vez de um erro. O admin continua funcionando."
            checked={form.maintenanceMode}
            onChange={(v) => setForm({ ...form, maintenanceMode: v })}
            perigo
          />
        </div>
      </Card>

      {/* ---- Empates ------------------------------------------------------ */}
      <Card className="p-5">
        <CardHeader kicker="§26 Empates numéricos" title="Posição repetida vira quantos pontos?" />
        <p className="mt-2 text-sm text-white/55">
          Quando duas duplas fazem exatamente o mesmo resultado (100 kg, 100 kg, 95 kg), as
          duas ficam em 1º. A pergunta é quantos pontos cada uma recebe.
        </p>

        <div className="mt-4 space-y-2">
          {TIE_MODES.map((opcao) => (
            <Escolha
              key={opcao.value}
              name="tiePointsMode"
              checked={form.tiePointsMode === opcao.value}
              onChange={() => setForm({ ...form, tiePointsMode: opcao.value })}
              titulo={opcao.titulo}
              descricao={opcao.descricao}
            />
          ))}
        </div>
      </Card>

      {/* ---- DNF ---------------------------------------------------------- */}
      <Card className="p-5">
        <CardHeader kicker="§13 WOD 3" title="Quem não concluiu dentro do CAP" />
        <p className="mt-2 text-sm text-white/55">
          A especificação do evento não define como ordenar as duplas que estouraram o CAP
          de 20:00. Enquanto a organização não decidir, o sistema mantém todas empatadas e
          sinalizadas — <strong>sem inventar critério</strong>.
        </p>

        <div className="mt-4 space-y-2">
          {DNF_POLICIES.map((opcao) => (
            <Escolha
              key={opcao.value}
              name="dnfPolicy"
              checked={form.dnfPolicy === opcao.value}
              onChange={() => setForm({ ...form, dnfPolicy: opcao.value })}
              titulo={opcao.titulo}
              descricao={opcao.descricao}
            />
          ))}
        </div>
      </Card>

      {/* ---- Desempate ---------------------------------------------------- */}
      <Card className="p-5">
        <CardHeader kicker="§15 Classificação geral" title="Critérios de desempate" />
        <p className="mt-2 text-sm text-white/55">
          Quando duas duplas da mesma categoria terminam com a{' '}
          <strong>mesma pontuação total</strong>, é isto que decide quem fica na
          frente. Os critérios são aplicados <strong>em ordem</strong>: o 2 só é
          consultado quando o 1 também empata.
        </p>
        <p className="mt-2 text-sm text-white/55">
          “Melhor colocação no WOD” quer dizer menor pontuação naquele workout. Uma
          dupla sem resultado no WOD do critério vai para trás — não há como comparar.
        </p>

        {/* O campo já foi texto livre. Se sobrou o que a organização escreveu
            na época, mostramos — apagar em silêncio seria pior. */}
        {form.tieBreakerLegado ? (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-2.5 text-xs text-amber-200/90">
            <strong className="font-display font-bold uppercase">Antes era texto livre.</strong>{' '}
            Estava escrito aqui: <em>“{form.tieBreakerLegado}”</em>. O sistema não
            adivinha o que a frase queria dizer — escolha o critério na lista abaixo e
            salve para ele passar a valer.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {([1, 2, 3] as const).map((n) => {
            const campo = `tieBreaker${n}` as const;
            return (
              <Select
                key={campo}
                id={`desempate-${n}`}
                label={`Critério ${n}`}
                value={form[campo]}
                onChange={(e) =>
                  setForm({ ...form, [campo]: e.target.value as TieBreaker })
                }
              >
                {TIE_BREAKERS.map((criterio) => (
                  <option key={criterio} value={criterio}>
                    {TIE_BREAKER_LABEL[criterio]}
                  </option>
                ))}
              </Select>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-white/45">
          Com os três em <strong>Nenhum</strong>, duplas empatadas dividem a posição, a
          tela mostra <strong>EMPATE</strong> e a decisão volta para a organização. É
          também o que acontece quando nenhum dos critérios escolhidos consegue
          separar as duas.
        </p>
      </Card>

      <div className="sticky bottom-0 border-t border-white/10 bg-nacao-abyss/92 py-3 backdrop-blur-md">
        <Button size="xl" onClick={salvar} disabled={pendente}>
          <Save size={18} aria-hidden="true" />
          {pendente ? 'Salvando…' : 'Salvar configurações'}
        </Button>
        <p className="mt-2 text-xs text-white/40">
          Mudar o modo de empate ou a política do WOD 3 recalcula a classificação inteira
          na hora.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  label,
  descricao,
  checked,
  onChange,
  perigo = false,
}: {
  label: string;
  descricao: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  perigo?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? perigo
            ? 'border-red-400/40 bg-red-500/10'
            : 'border-nacao-cyan/40 bg-nacao-cyan/[0.08]'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#20C4FA]"
      />
      <span>
        <span className="block font-display text-sm font-bold tracking-wider uppercase">
          {label} — {checked ? 'ligado' : 'desligado'}
        </span>
        <span className="mt-0.5 block text-xs text-white/55">{descricao}</span>
      </span>
    </label>
  );
}

function Escolha({
  name,
  checked,
  onChange,
  titulo,
  descricao,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  titulo: string;
  descricao: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        checked ? 'border-nacao-cyan/40 bg-nacao-cyan/[0.08]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#20C4FA]"
      />
      <span>
        <span className="block font-display text-sm font-bold">{titulo}</span>
        <span className="mt-0.5 block text-xs text-white/55">{descricao}</span>
      </span>
    </label>
  );
}
