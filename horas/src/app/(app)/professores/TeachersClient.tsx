'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import type { TeacherRow } from '@/server/services/teacher-service';
import { saveTeacherAction } from './actions';

type Mod = { id: string; name: string; color: string; areaId: string };
type Opt = { id: string; name: string };

export function TeachersClient({
  teachers, modalities, areas, positions, contractTypes, canEdit, myAreaIds,
}: {
  teachers: TeacherRow[]; modalities: Mod[]; areas: Opt[]; positions: Opt[]; contractTypes: Opt[];
  canEdit: boolean; myAreaIds: string[] | null;
}) {
  const [q, setQ] = useState('');
  const [area, setArea] = useState<string>(myAreaIds?.length === 1 ? myAreaIds[0]! : '');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | 'new' | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return teachers.filter((t) =>
      (showInactive || t.active) &&
      (!area || t.modalities.some((m) => m.areaId === area)) &&
      (!needle || `${t.name} ${t.displayName ?? ''} ${t.modalities.map((m) => m.name).join(' ')}`.toLowerCase().includes(needle)),
    );
  }, [teachers, q, area, showInactive]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-fraca" />
          <Input className="pl-9" placeholder="Nome ou modalidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="lg:w-56" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar por área">
          <option value="">Todas as áreas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" className="accent-[#0169E9]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
        <div className="flex-1" />
        {canEdit && <Button onClick={() => setEditing('new')}><Plus /> Novo professor</Button>}
      </div>

      <p className="mb-2 text-xs font-semibold text-tinta-fraca">{filtered.length} de {teachers.filter((t) => t.active).length} ativos</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} className={cn('flex gap-3 p-4', !t.active && 'opacity-55')}>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">
              {initials(t.displayName || t.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-tinta">{t.displayName || t.name}</p>
                  <p className="truncate text-xs text-tinta-fraca">
                    {[t.displayName ? t.name : null, t.positionName, t.contractTypeName, t.level].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`Editar ${t.name}`}><Pencil /></Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {!t.active && <Badge tone="red">inativo</Badge>}
                {t.modalities.map((m) => (
                  <Badge key={m.id} tone="neutral">
                    <span className="size-2 rounded-full" style={{ background: m.color }} />
                    {m.name}
                  </Badge>
                ))}
                {t.modalities.length === 0 && <span className="text-xs text-atencao">sem modalidade habilitada</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && (
        <Card className="p-10 text-center text-sm text-tinta-suave">
          {teachers.length === 0 ? 'Nenhum professor cadastrado ainda. A importação da planilha (grade) também cria professores.' : 'Ninguém com esses filtros.'}
        </Card>
      )}

      {editing && (
        <TeacherSheet
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? null : editing}
          modalities={modalities}
          areas={areas}
          positions={positions}
          contractTypes={contractTypes}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TeacherSheet({ row, modalities, areas, positions, contractTypes, onClose }: {
  row: TeacherRow | null; modalities: Mod[]; areas: Opt[]; positions: Opt[]; contractTypes: Opt[]; onClose: () => void;
}) {
  const [v, setV] = useState({
    name: row?.name ?? '',
    displayName: row?.displayName ?? '',
    email: row?.email ?? '',
    phone: row?.phone ?? '',
    admissionDate: row?.admissionDate ?? '',
    terminationDate: row?.terminationDate ?? '',
    active: row?.active ?? true,
    primaryModalityId: row?.primaryModalityId ?? '',
    positionId: row?.positionId ?? '',
    contractTypeId: row?.contractTypeId ?? '',
    level: row?.level ?? '',
    notes: row?.notes ?? '',
    modalityIds: row?.modalities.map((m) => m.id) ?? [],
    aliases: (row?.aliases ?? []).join(', '),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const toggleMod = (id: string) =>
    set('modalityIds', v.modalityIds.includes(id) ? v.modalityIds.filter((x) => x !== id) : [...v.modalityIds, id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveTeacherAction(row?.id ?? null, {
        ...v,
        aliases: v.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      });
      if (!r.ok) return setError(r.error);
      onClose();
    });
  };

  return (
    <Sheet
      title={row ? `Editar ${row.displayName || row.name}` : 'Novo professor'}
      onClose={onClose}
      onSubmit={submit}
      footer={<Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="t-name">Nome completo *</Label>
          <Input id="t-name" required value={v.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-display">Nome na grade</Label>
          <Input id="t-display" placeholder="Ex.: Rafa" value={v.displayName} onChange={(e) => set('displayName', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-level">Nível</Label>
          <Input id="t-level" placeholder="N1…N5" value={v.level} onChange={(e) => set('level', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-pos">Cargo</Label>
          <Select id="t-pos" value={v.positionId} onChange={(e) => set('positionId', e.target.value)}>
            <option value="">—</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="t-ct">Vínculo</Label>
          <Select id="t-ct" value={v.contractTypeId} onChange={(e) => set('contractTypeId', e.target.value)}>
            <option value="">—</option>
            {contractTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-tinta-suave">Modalidades habilitadas</legend>
        <div className="space-y-3">
          {areas.map((a) => {
            const mods = modalities.filter((m) => m.areaId === a.id);
            if (!mods.length) return null;
            return (
              <div key={a.id}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-tinta-fraca">{a.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {mods.map((m) => {
                    const on = v.modalityIds.includes(m.id);
                    return (
                      <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleMod(m.id)}
                        className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-transparent text-white' : 'border-borda text-tinta-suave')}
                        style={on ? { background: m.color } : undefined}>
                        {!on && <span className="size-2 rounded-full" style={{ background: m.color }} />}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="t-primary">Modalidade principal</Label>
        <Select id="t-primary" value={v.primaryModalityId} onChange={(e) => set('primaryModalityId', e.target.value)}>
          <option value="">—</option>
          {modalities.filter((m) => v.modalityIds.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      <div>
        <Label htmlFor="t-aliases">Como aparece na planilha (apelidos)</Label>
        <Input id="t-aliases" placeholder="Ex.: Rafa, Rafael (coordenação)" value={v.aliases} onChange={(e) => set('aliases', e.target.value)} />
        <p className="mt-1 text-xs text-tinta-suave">Separados por vírgula. Usados só na importação para reconhecer o professor.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="t-email">E-mail</Label>
          <Input id="t-email" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-phone">Telefone</Label>
          <Input id="t-phone" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-adm">Admissão</Label>
          <Input id="t-adm" type="date" value={v.admissionDate} onChange={(e) => set('admissionDate', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-term">Desligamento</Label>
          <Input id="t-term" type="date" value={v.terminationDate} onChange={(e) => set('terminationDate', e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="t-notes">Observações</Label>
        <textarea id="t-notes" rows={3} className="w-full rounded-lg border border-borda px-3 py-2 text-sm focus:border-nacao focus:outline-none" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="accent-[#0169E9]" checked={v.active} onChange={(e) => set('active', e.target.checked)} />
        Ativo
      </label>
      <FormMessage error={error} />
    </Sheet>
  );
}
