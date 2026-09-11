'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import type { Category, Team, TeamStatus } from '@/types/domain';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  TEAM_STATUSES,
  TEAM_STATUS_LABEL,
} from '@/types/domain';
import type { Snapshot } from '@/services/snapshot';
import { excluirDupla, salvarDupla } from '@/app/admin/actions';
import type { ActionResult } from '@/app/admin/actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchBar } from '@/components/SearchBar';
import { normalize, teamNumber } from '@/lib/format';

interface FormState {
  id?: string;
  teamNumber: string;
  teamName: string;
  category: Category;
  athlete1: string;
  athlete2: string;
  battery: '1' | '2';
  status: TeamStatus;
}

const novo = (proximoNumero: number): FormState => ({
  teamNumber: String(proximoNumero),
  teamName: '',
  category: 'MISTA',
  athlete1: '',
  athlete2: '',
  battery: '1',
  status: 'INSCRITA',
});

/** Cadastro e edição de duplas (§18). */
export function TeamsManager({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [excluindo, setExcluindo] = useState<Team | null>(null);
  const [aviso, setAviso] = useState<ActionResult | null>(null);

  const times = useMemo(
    () => [...snapshot.teams].sort((a, b) => a.teamNumber - b.teamNumber),
    [snapshot.teams],
  );

  const visiveis = useMemo(() => {
    const q = normalize(busca);
    if (!q) return times;
    return times.filter((t) =>
      normalize(`${t.teamNumber} ${t.teamName} ${t.athlete1} ${t.athlete2}`).includes(q),
    );
  }, [times, busca]);

  const proximoNumero = (times.at(-1)?.teamNumber ?? 0) + 1;

  const abrirEdicao = (team: Team) =>
    setForm({
      id: team.id,
      teamNumber: String(team.teamNumber),
      teamName: team.teamName,
      category: team.category,
      athlete1: team.athlete1,
      athlete2: team.athlete2,
      battery: team.battery === 2 ? '2' : '1',
      status: team.status,
    });

  function salvar() {
    if (!form) return;
    setAviso(null);
    startTransition(async () => {
      const resultado = await salvarDupla(form);
      setAviso(resultado);
      if (resultado.ok) {
        setForm(null);
        router.refresh();
      }
    });
  }

  function excluir() {
    if (!excluindo) return;
    startTransition(async () => {
      const resultado = await excluirDupla(excluindo.id);
      setAviso(resultado);
      setExcluindo(null);
      if (resultado.ok) router.refresh();
    });
  }

  const semAtletas = times.filter((t) => !t.athlete1.trim() || !t.athlete2.trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            value={busca}
            onChange={setBusca}
            placeholder="Buscar dupla, atleta ou número"
            resultCount={visiveis.length}
          />
        </div>
        <Button size="lg" onClick={() => setForm(novo(proximoNumero))}>
          <Plus size={17} aria-hidden="true" />
          Nova dupla
        </Button>
      </div>

      {semAtletas > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-2.5 text-sm text-amber-100/90">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {semAtletas} dupla(s) ainda sem nome dos dois atletas. O seed cria as 20 duplas
            numeradas com os nomes em branco — preencha antes do evento para a busca
            funcionar. Confirme também a <strong>categoria</strong> de cada uma.
          </span>
        </p>
      ) : null}

      {aviso ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            aviso.ok
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {aviso.message}
        </p>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/12">
              {['Nº', 'Dupla', 'Atletas', 'Categoria', 'Bateria', 'Status', ''].map((h, i) => (
                <th
                  key={h || `acao-${i}`}
                  scope="col"
                  className="px-3 py-3 font-display text-[10px] font-bold tracking-wider text-white/45 uppercase"
                >
                  {h || <span className="sr-only">Ações</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((team) => (
              <tr key={team.id} className="border-b border-white/[0.07]">
                <td className="tnum px-3 py-2.5 font-display font-bold text-nacao-sky">
                  {teamNumber(team.teamNumber)}
                </td>
                <td className="px-3 py-2.5 font-display text-sm font-bold">{team.teamName}</td>
                <td className="px-3 py-2.5 text-xs text-white/55">
                  {team.athlete1 || <span className="text-amber-300/70">a preencher</span>}
                  <span className="text-white/25"> · </span>
                  {team.athlete2 || <span className="text-amber-300/70">a preencher</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone="neutral">{CATEGORY_SHORT[team.category]}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone="sky">{team.battery}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge
                    tone={
                      team.status === 'ATIVA'
                        ? 'ok'
                        : team.status === 'DESCLASSIFICADA'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {TEAM_STATUS_LABEL[team.status]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(team)}
                      aria-label={`Editar dupla ${team.teamName}`}
                      className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(team)}
                      aria-label={`Excluir dupla ${team.teamName}`}
                      className="rounded-lg p-2 text-white/45 hover:bg-red-500/15 hover:text-red-300"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ---- Formulário --------------------------------------------------- */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar dupla' : 'Nova dupla'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar dupla'}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Número"
                inputMode="numeric"
                value={form.teamNumber}
                onChange={(e) => setForm({ ...form, teamNumber: e.target.value })}
              />
              <Select
                label="Bateria"
                value={form.battery}
                onChange={(e) => setForm({ ...form, battery: e.target.value as '1' | '2' })}
              >
                <option value="1">Bateria 1</option>
                <option value="2">Bateria 2</option>
              </Select>
            </div>

            <Input
              label="Nome da dupla"
              value={form.teamName}
              onChange={(e) => setForm({ ...form, teamName: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Atleta 1"
                value={form.athlete1}
                onChange={(e) => setForm({ ...form, athlete1: e.target.value })}
              />
              <Input
                label="Atleta 2"
                value={form.athlete2}
                onChange={(e) => setForm({ ...form, athlete2: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Categoria"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TeamStatus })}
              >
                {TEAM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TEAM_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ---- Exclusão ----------------------------------------------------- */}
      <Modal
        open={excluindo !== null}
        onClose={() => setExcluindo(null)}
        title="Excluir dupla?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={excluir} disabled={pendente}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          A dupla <strong>{excluindo?.teamName}</strong> e todos os resultados dela serão
          apagados. Se a intenção é apenas tirá-la do ranking, use o status{' '}
          <strong>Desclassificada</strong> — assim o histórico é preservado.
        </p>
      </Modal>
    </div>
  );
}
