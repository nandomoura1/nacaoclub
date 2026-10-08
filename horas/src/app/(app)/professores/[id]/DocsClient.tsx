'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, FileUp, MinusCircle, Trash2, XCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { InternCounter } from '@/components/staff-docs/InternCounter';
import { formatDateBR } from '@/domain/dates';
import { STAFF_DOC_KINDS, type StaffDocKind } from '@/domain/staff-docs';
import { cn } from '@/lib/cn';
import type { TeacherDocsView } from '@/server/services/staff-doc-service';
import { deleteTeacherDocAction, uploadTeacherDocAction } from '../documentos/actions';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic';

/** Pasta do funcionário: checklist, contador do estágio, envio e arquivos. */
export function DocsTab({ v }: { v: TeacherDocsView }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const firstMissing = v.checklist.find((c) => c.state === 'faltando' || c.state === 'vencido')?.kind;
  const [kind, setKind] = useState<StaffDocKind>(firstMissing ?? (v.intern ? 'CONTRATO_ESTAGIO' : 'IDENTIDADE'));
  const [form, setForm] = useState({ validFrom: '', validUntil: '', number: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const def = STAFF_DOC_KINDS.find((k) => k.id === kind)!;

  const send = () => start(async () => {
    setMsg({});
    if (!file) return setMsg({ error: 'Escolha o arquivo (PDF ou foto).' });
    const fd = new FormData();
    fd.set('file', file);
    fd.set('kind', kind);
    for (const [k, val] of Object.entries(form)) fd.set(k, def.dates === 'none' && (k === 'validFrom' || k === 'validUntil') ? '' : val);
    const r = await uploadTeacherDocAction(v.id, fd);
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message });
    setFile(null);
    setForm({ validFrom: '', validUntil: '', number: '', notes: '' });
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {v.internship && <InternCounter s={v.internship} />}

      <Card className="p-4">
        <h2 className="font-bold text-navy">Checklist da pasta</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3 [&>*]:min-w-0">
          {v.checklist.map((c) => {
            const Icon = c.state === 'ok' ? CheckCircle2 : c.state === 'opcional' ? MinusCircle : XCircle;
            return (
              <li key={c.kind} className={cn('flex items-center gap-2 rounded-xl border p-2.5 text-sm', c.state === 'ok' ? 'border-sucesso/25 bg-sucesso/5' : c.state === 'opcional' ? 'border-borda' : 'border-critico/30 bg-critico/5')}>
                <Icon className={cn('size-5 shrink-0', c.state === 'ok' ? 'text-sucesso' : c.state === 'opcional' ? 'text-tinta-fraca' : 'text-critico')} />
                <span className="min-w-0">
                  <span className="block font-semibold text-tinta">{c.label}</span>
                  <span className="block text-xs text-tinta-suave">{c.state === 'ok' ? (c.until ? `válido até ${formatDateBR(c.until)}` : 'na pasta') : c.state === 'vencido' ? `vencido em ${formatDateBR(c.until!)}` : c.state === 'opcional' ? 'opcional para estagiário' : 'faltando'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {!v.contractType && <p className="mt-2 text-xs text-atencao">Vínculo não informado no cadastro — informe "Estágio", "CLT"… para o sistema saber qual contrato exigir.</p>}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-navy">Enviar documento</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          <div className="sm:col-span-2">
            <Label>Tipo</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as StaffDocKind)}>
              {STAFF_DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </Select>
            <p className="mt-0.5 text-[11px] text-tinta-fraca">{def.hint}</p>
          </div>
          {def.number && <div><Label>{def.number} (opcional)</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>}
          {(def.dates === 'range' || def.dates === 'range-required') && (
            <div><Label>Início{def.dates === 'range-required' ? '' : ' (opcional)'}</Label><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
          )}
          {def.dates !== 'none' && (
            <div><Label>{def.dates === 'until' ? 'Validade (opcional)' : def.dates === 'range-required' ? 'Fim do contrato' : 'Fim (opcional)'}</Label><Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div>
          )}
          <div className="sm:col-span-2"><Label>Observação (opcional)</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={kind === 'CONTRATO_ESTAGIO' ? 'ex.: 1º aditivo' : ''} /></div>
          <div className="sm:col-span-2">
            <Label>Arquivo (PDF ou foto, até 6 MB)</Label>
            <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-nacao/10 file:px-3 file:py-2 file:font-semibold file:text-nacao" />
          </div>
        </div>
        {kind === 'CONTRATO_ESTAGIO' && <p className="mt-2 text-xs text-tinta-suave">Aditivo de prorrogação: envie como um novo contrato de estágio com as novas datas — o contador passa a usar o fim mais recente.</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button disabled={pending || !file} onClick={send}><FileUp /> {pending ? 'Enviando…' : 'Guardar na pasta'}</Button>
          <FormMessage error={msg.error} success={msg.ok} />
        </div>
      </Card>

      <Card className="divide-y divide-borda">
        <h2 className="p-4 font-bold text-navy">Arquivos ({v.documents.length})</h2>
        {v.documents.length === 0 && <p className="p-4 pt-0 text-sm text-tinta-suave">Pasta vazia.</p>}
        {v.documents.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5"><Badge tone="blue">{STAFF_DOC_KINDS.find((k) => k.id === d.kind)?.label ?? d.kind}</Badge> <span className="truncate font-semibold text-tinta" title={d.filename}>{d.filename}</span></p>
              <p className="mt-0.5 text-xs text-tinta-suave">
                {[d.validFrom || d.validUntil ? `${d.validFrom ? formatDateBR(d.validFrom) : '…'} a ${d.validUntil ? formatDateBR(d.validUntil) : '…'}` : null, d.number && `nº ${d.number}`, d.notes, `${(d.sizeBytes / 1024).toFixed(0)} KB`, `enviado em ${new Date(d.createdAt).toLocaleDateString('pt-BR')}${d.uploadedBy ? ` por ${d.uploadedBy}` : ''}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <a href={`/professores/documentos/arquivo/${d.id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Download /> Abrir</a>
            <Button variant="ghost" size="sm" disabled={pending} aria-label="Remover" onClick={() => {
              if (!confirm(`Remover "${d.filename}" da pasta?`)) return;
              start(async () => { const r = await deleteTeacherDocAction(v.id, d.id); setMsg(r.ok ? { ok: r.message } : { error: r.error }); router.refresh(); });
            }}><Trash2 /></Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
