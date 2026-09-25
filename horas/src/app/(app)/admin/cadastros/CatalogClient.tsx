'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import type { CatalogDef, FieldDef, OptionSource } from '@/shared/catalogs';
import { saveCatalogAction } from './actions';

type Option = { value: string; label: string; inactive: boolean };
type Options = Record<OptionSource, Option[]>;
type Row = Record<string, unknown> & { id: string };

function initialValues(def: CatalogDef, row: Row | null) {
  return Object.fromEntries(
    def.fields.map((f) => [f.key, row ? (row[f.key] ?? (f.type === 'checkbox' ? false : '')) : (f.default ?? (f.type === 'checkbox' ? false : ''))]),
  ) as Record<string, unknown>;
}

function Cell({ field, row, options }: { field: FieldDef; row: Row; options: Options }) {
  const v = row[field.key];
  if (field.type === 'checkbox') return v ? <Badge tone="green">sim</Badge> : <Badge>não</Badge>;
  if (field.type === 'color') return <span className="inline-block size-4 rounded-full ring-1 ring-borda" style={{ background: String(v) }} />;
  if (field.type === 'select' && field.options) {
    return <span>{options[field.options].find((o) => o.value === v)?.label ?? '—'}</span>;
  }
  if (field.type === 'number' && field.key === 'defaultDurationMin') return <span className="tabular">{String(v)} min</span>;
  return <span>{v === null || v === '' ? '—' : String(v)}</span>;
}

export function CatalogClient({ def, rows, options }: { def: CatalogDef; rows: Row[]; options: Options }) {
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const columns = def.fields.filter((f) => f.column);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-sm text-tinta-suave">{def.description}</p>
        <Button onClick={() => setEditing('new')}>
          <Plus /> Adicionar {def.singular}
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs font-bold uppercase tracking-wider text-tinta-fraca">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3">{c.label}</th>
              ))}
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {rows.map((row) => (
              <tr key={row.id} className={cn('hover:bg-fundo/60', row.active === false && 'opacity-50')}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3', c.key === 'name' && 'font-semibold text-tinta')}>
                    {c.key === 'name' && typeof row.color === 'string' ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: row.color }} />
                        {String(row.name)}
                      </span>
                    ) : (
                      <Cell field={c} row={row} options={options} />
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(row)} aria-label={`Editar ${String(row.name)}`}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-tinta-suave">Nada cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing && (
        <CatalogSheet
          key={editing === 'new' ? 'new' : editing.id}
          def={def}
          row={editing === 'new' ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CatalogSheet({ def, row, options, onClose }: { def: CatalogDef; row: Row | null; options: Options; onClose: () => void }) {
  const [values, setValues] = useState(() => initialValues(def, row));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveCatalogAction(def.key, row?.id ?? null, values);
      if (!r.ok) return setError(r.error);
      onClose();
    });
  };

  return (
    <Sheet
      title={row ? `Editar ${def.singular}` : `Novo cadastro · ${def.singular}`}
      onClose={onClose}
      onSubmit={submit}
      footer={<Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</Button>}
    >
      {def.fields.map((f) => {
        const id = `f-${f.key}`;
        const v = values[f.key];
        if (f.type === 'checkbox') {
          return (
            <label key={f.key} className="flex cursor-pointer items-start gap-3">
              <input id={id} type="checkbox" className="mt-1 accent-[#0169E9]" checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />
              <span>
                <span className="block text-sm font-semibold">{f.label}</span>
                {f.help && <span className="block text-xs text-tinta-suave">{f.help}</span>}
              </span>
            </label>
          );
        }
        return (
          <div key={f.key}>
            <Label htmlFor={id}>{f.label}{f.required && ' *'}</Label>
            {f.type === 'select' && f.options ? (
              <Select id={id} value={String(v ?? '')} required={f.required} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">{f.required ? 'Escolha…' : '— nenhum —'}</option>
                {options[f.options].filter((o) => !o.inactive || o.value === v).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            ) : f.type === 'color' ? (
              <div className="flex items-center gap-3">
                <input id={id} type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-borda bg-white p-1" value={String(v || '#0169E9')} onChange={(e) => set(f.key, e.target.value)} />
                <code className="text-sm text-tinta-suave">{String(v)}</code>
              </div>
            ) : (
              <Input
                id={id}
                type={f.type === 'number' ? 'number' : 'text'}
                min={f.min}
                max={f.max}
                required={f.required}
                value={String(v ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
            {f.help && <p className="mt-1 text-xs text-tinta-suave">{f.help}</p>}
          </div>
        );
      })}
      <FormMessage error={error} />
    </Sheet>
  );
}
