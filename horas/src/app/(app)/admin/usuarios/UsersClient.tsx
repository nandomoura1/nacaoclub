'use client';

import { useMemo, useState, useTransition } from 'react';
import { Copy, KeyRound, Pencil, Plus, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { formatDateTime, initials } from '@/lib/format';
import { createUserAction, resetPasswordAction, updateUserAction, type UserFormPayload } from './actions';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roleKeys: string[];
  areaIds: string[];
  isSelf: boolean;
}

interface RoleOption { key: string; name: string; description: string }
interface AreaOption { id: string; name: string; color: string }

type Editing = { mode: 'create' } | { mode: 'edit'; user: UserRow } | null;

export function UsersClient({ users, roles, areas }: { users: UserRow[]; roles: RoleOption[]; areas: AreaOption[] }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);

  const roleName = useMemo(() => new Map(roles.map((r) => [r.key, r.name])), [roles]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-fraca" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button onClick={() => setEditing({ mode: 'create' })}>
          <Plus /> Novo usuário
        </Button>
      </div>

      {secret && <TemporaryPassword {...secret} onClose={() => setSecret(null)} />}

      <Card className="divide-y divide-borda">
        {filtered.map((u) => (
          <div key={u.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !u.active && 'opacity-55')}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">
              {initials(u.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-tinta">
                {u.name}
                {u.isSelf && <Badge tone="blue">você</Badge>}
                {!u.active && <Badge tone="red">inativo</Badge>}
                {u.mustChangePassword && u.active && <Badge tone="amber">senha provisória</Badge>}
              </p>
              <p className="truncate text-sm text-tinta-suave">{u.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:w-72 sm:justify-end">
              {u.roleKeys.map((k) => (
                <Badge key={k} tone={k === 'ADMIN' ? 'navy' : 'neutral'}>{roleName.get(k) ?? k}</Badge>
              ))}
              {u.areaIds.map((id) => {
                const a = areaById.get(id);
                return a ? (
                  <Badge key={id} tone="neutral">
                    <span className="size-2 rounded-full" style={{ background: a.color }} />
                    {a.name}
                  </Badge>
                ) : null;
              })}
            </div>
            <div className="flex items-center gap-1 text-xs text-tinta-fraca sm:w-40 sm:justify-end">
              {u.lastLoginAt ? `último acesso ${formatDateTime(new Date(u.lastLoginAt))}` : 'nunca entrou'}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing({ mode: 'edit', user: u })} aria-label={`Editar ${u.name}`}>
              <Pencil /> Editar
            </Button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-tinta-suave">Ninguém encontrado.</p>}
      </Card>

      {editing && (
        <UserSheet
          key={editing.mode === 'edit' ? editing.user.id : 'new'}
          editing={editing}
          roles={roles}
          areas={areas}
          onClose={() => setEditing(null)}
          onSecret={(s) => setSecret(s)}
        />
      )}
    </>
  );
}

function TemporaryPassword({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="mb-4 border-ciano bg-ciano/5 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 text-nacao" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy">Senha provisória de {name}</p>
          <p className="text-xs text-tinta-suave">
            Mostrada só agora. Repasse por um canal seguro; no primeiro acesso a pessoa cria a própria senha.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-md bg-white px-3 py-1.5 font-mono text-base tracking-wider ring-1 ring-borda">{password}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(password).then(() => setCopied(true))}
            >
              <Copy /> {copied ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
        </div>
        <button onClick={onClose} className="text-tinta-fraca hover:text-tinta" aria-label="Fechar">
          <X className="size-4" />
        </button>
      </div>
    </Card>
  );
}

function UserSheet({
  editing,
  roles,
  areas,
  onClose,
  onSecret,
}: {
  editing: NonNullable<Editing>;
  roles: RoleOption[];
  areas: AreaOption[];
  onClose: () => void;
  onSecret: (s: { name: string; password: string }) => void;
}) {
  const initial = editing.mode === 'edit' ? editing.user : null;
  const [form, setForm] = useState<UserFormPayload>({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    roleKeys: initial?.roleKeys ?? ['COORDENADOR'],
    areaIds: initial?.areaIds ?? [],
    active: initial?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      if (editing.mode === 'create') {
        const r = await createUserAction(form);
        if (!r.ok) return setError(r.error);
        onSecret({ name: form.name, password: r.data.temporaryPassword });
      } else {
        const r = await updateUserAction(editing.user.id, form);
        if (!r.ok) return setError(r.error);
      }
      onClose();
    });
  };

  const reset = () => {
    if (editing.mode !== 'edit') return;
    setError(null);
    start(async () => {
      const r = await resetPasswordAction(editing.user.id);
      if (!r.ok) return setError(r.error);
      onSecret({ name: editing.user.name, password: r.data.temporaryPassword });
      onClose();
    });
  };

  const isCoordinator = form.roleKeys.includes('COORDENADOR');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda px-6 py-4">
          <h2 className="text-lg font-extrabold text-navy">{editing.mode === 'create' ? 'Novo usuário' : 'Editar usuário'}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-tinta-fraca hover:text-tinta">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <div>
            <Label htmlFor="u-name">Nome</Label>
            <Input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="u-email">E-mail</Label>
            <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-tinta-suave">Papel</legend>
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r.key} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', form.roleKeys.includes(r.key) ? 'border-nacao bg-nacao/5' : 'border-borda')}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#0169E9]"
                    checked={form.roleKeys.includes(r.key)}
                    onChange={() => setForm({ ...form, roleKeys: toggle(form.roleKeys, r.key) })}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{r.name}</span>
                    <span className="block text-xs text-tinta-suave">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-tinta-suave">
              Áreas de coordenação {isCoordinator ? '' : '(só para coordenadores)'}
            </legend>
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => {
                const on = form.areaIds.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => setForm({ ...form, areaIds: toggle(form.areaIds, a.id) })}
                    className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave')}
                    aria-pressed={on}
                  >
                    <span className="size-2.5 rounded-full ring-2 ring-white/60" style={{ background: a.color }} />
                    {a.name}
                  </button>
                );
              })}
            </div>
            {isCoordinator && form.areaIds.length === 0 && (
              <p className="mt-2 text-xs text-atencao">Coordenador sem área não enxerga nenhuma aula.</p>
            )}
          </fieldset>

          {editing.mode === 'edit' && (
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" className="accent-[#0169E9]" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Usuário ativo
            </label>
          )}

          <FormMessage error={error} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-borda px-6 py-4">
          <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : editing.mode === 'create' ? 'Criar e gerar senha' : 'Salvar'}</Button>
          {editing.mode === 'edit' && (
            <Button type="button" variant="secondary" onClick={reset} disabled={pending}>
              <KeyRound /> Nova senha provisória
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
