'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Download, FileUp, Landmark, Plus, Save, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { COMPANY_DOC_KINDS, formatCnpj, type CompanyDocKind } from '@/domain/company';
import { formatDateBR } from '@/domain/dates';
import { cn } from '@/lib/cn';
import type { CompanyView } from '@/server/services/company-service';
import { archiveCompanyDocAction, deleteCompanyDocAction, saveCompanyAction, uploadCompanyDocAction } from '../actions';
import { ValidityBadge } from '../ValidityBadge';

type Data = CompanyView['data'];
type Bank = Data['bankAccounts'][number];
const EMPTY: Data = {
  legalName: '', tradeName: null, cnpj: null, stateRegistration: null, municipalRegistration: null, openingDate: null, taxRegime: null, mainActivity: null,
  address: null, email: null, phone: null, legalRepresentative: null, accountant: null, notes: null, active: true, bankAccounts: [],
};
const TAX = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'];

/** Dados gerais + contas bancárias. */
export function CompanyForm({ id, initial, canEdit }: { id: string | null; initial: Data | null; canEdit: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<Data>({ ...(initial ?? EMPTY), cnpj: initial?.cnpj ? formatCnpj(initial.cnpj) : null });
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const set = (k: keyof Data, v: unknown) => { setD({ ...d, [k]: v }); setMsg({}); };
  const f = (k: keyof Data, label: string, opts: { type?: string; wide?: boolean; placeholder?: string } = {}) => (
    <div className={cn(opts.wide && 'sm:col-span-2')}>
      <Label>{label}</Label>
      <Input type={opts.type} value={(d[k] as string | null) ?? ''} placeholder={opts.placeholder} disabled={!canEdit} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const setBank = (i: number, k: keyof Bank, v: string) => set('bankAccounts', d.bankAccounts.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const save = () => start(async () => {
    const r = await saveCompanyAction(id, { ...d, cnpj: d.cnpj ?? '', openingDate: d.openingDate ?? '' });
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message });
    if (!id) router.push(`/admin/empresas/${r.data}?aba=documentos`);
    else router.refresh();
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-bold text-navy">Dados gerais</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {f('legalName', 'Razão social', { wide: true })}
          {f('tradeName', 'Nome fantasia', { wide: true })}
          {f('cnpj', 'CNPJ', { placeholder: '00.000.000/0000-00' })}
          {f('openingDate', 'Data de abertura', { type: 'date' })}
          {f('stateRegistration', 'Inscrição estadual')}
          {f('municipalRegistration', 'Inscrição municipal / CF-DF')}
          <div>
            <Label>Regime tributário</Label>
            <Select value={d.taxRegime ?? ''} disabled={!canEdit} onChange={(e) => set('taxRegime', e.target.value)}>
              <option value="">—</option>{TAX.map((t) => <option key={t}>{t}</option>)}
              {d.taxRegime && !TAX.includes(d.taxRegime) && <option>{d.taxRegime}</option>}
            </Select>
          </div>
          {f('mainActivity', 'Atividade principal (CNAE)', { wide: true, placeholder: 'ex.: 9313-1/00 — Atividades de condicionamento físico' })}
          {f('address', 'Endereço', { wide: true })}
          {f('phone', 'Telefone')}
          {f('email', 'E-mail')}
          {f('legalRepresentative', 'Representante legal / sócio administrador', { wide: true })}
          {f('accountant', 'Contabilidade (escritório e contato)', { wide: true })}
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Observações</Label>
            <textarea className="min-h-20 w-full rounded-lg border border-borda p-2 text-sm" value={d.notes ?? ''} disabled={!canEdit} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} disabled={!canEdit} onChange={(e) => set('active', e.target.checked)} /> Empresa ativa</label>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 font-bold text-navy"><Landmark className="size-4" /> Contas bancárias</h2>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => set('bankAccounts', [...d.bankAccounts, { bank: '', agency: null, account: null, accountType: 'Conta corrente', pixKey: null, notes: null }])}><Plus /> Conta</Button>}
        </div>
        {d.bankAccounts.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Nenhuma conta cadastrada.</p>}
        <div className="mt-3 space-y-3">
          {d.bankAccounts.map((b, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-fundo p-3 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
              <div className="lg:col-span-2"><Label>Banco</Label><Input value={b.bank} disabled={!canEdit} onChange={(e) => setBank(i, 'bank', e.target.value)} placeholder="ex.: Banco do Brasil" /></div>
              <div><Label>Agência</Label><Input value={b.agency ?? ''} disabled={!canEdit} onChange={(e) => setBank(i, 'agency', e.target.value)} /></div>
              <div><Label>Conta</Label><Input value={b.account ?? ''} disabled={!canEdit} onChange={(e) => setBank(i, 'account', e.target.value)} /></div>
              <div className="lg:col-span-2"><Label>Tipo</Label><Input value={b.accountType ?? ''} disabled={!canEdit} onChange={(e) => setBank(i, 'accountType', e.target.value)} /></div>
              <div className="lg:col-span-3"><Label>Chave PIX</Label><Input value={b.pixKey ?? ''} disabled={!canEdit} onChange={(e) => setBank(i, 'pixKey', e.target.value)} /></div>
              <div className="lg:col-span-2"><Label>Observação</Label><Input value={b.notes ?? ''} disabled={!canEdit} onChange={(e) => setBank(i, 'notes', e.target.value)} placeholder="ex.: aplicação, maquininha" /></div>
              {canEdit && <div className="flex items-end"><Button variant="ghost" size="sm" aria-label="Remover conta" onClick={() => set('bankAccounts', d.bankAccounts.filter((_, j) => j !== i))}><Trash2 /></Button></div>}
            </div>
          ))}
        </div>
      </Card>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button disabled={pending} onClick={save}><Save /> {pending ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar empresa'}</Button>
          <FormMessage error={msg.error} success={msg.ok} />
        </div>
      )}
    </div>
  );
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx';

/** Pasta de documentos essenciais. */
export function CompanyDocs({ v, canEdit }: { v: CompanyView; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const firstMissing = v.checklist.find((c) => c.state === 'faltando')?.kind;
  const [kind, setKind] = useState<CompanyDocKind>((firstMissing as CompanyDocKind) ?? 'CONTRATO_SOCIAL');
  const [form, setForm] = useState({ title: '', validFrom: '', validUntil: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const def = COMPANY_DOC_KINDS.find((k) => k.id === kind)!;
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: r.message } : { error: r.error });
    router.refresh();
  });
  const send = () => start(async () => {
    setMsg({});
    if (!file) return setMsg({ error: 'Escolha o arquivo.' });
    const fd = new FormData();
    fd.set('file', file);
    fd.set('kind', kind);
    for (const [k, val] of Object.entries(form)) fd.set(k, val);
    const r = await uploadCompanyDocAction(v.id, fd);
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message });
    setFile(null);
    setForm({ title: '', validFrom: '', validUntil: '', notes: '' });
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  });
  const active = v.documents.filter((d) => !d.archived);
  const archived = v.documents.filter((d) => d.archived);
  const groups = COMPANY_DOC_KINDS.map((k) => ({ ...k, docs: active.filter((d) => d.kind === k.id) })).filter((g) => g.docs.length);

  const Doc = ({ d }: { d: CompanyView['documents'][number] }) => (
    <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold text-tinta" title={d.filename}>{d.title ?? d.filename}</span>
          {!d.archived && <ValidityBadge state={d.validity.state} daysLeft={d.validity.daysLeft} />}
          {d.archived && <Badge>arquivado</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-tinta-suave">
          {[d.title ? d.filename : null, d.validFrom && `emitido em ${formatDateBR(d.validFrom)}`, d.validUntil && `válido até ${formatDateBR(d.validUntil)}`, d.notes, `${(d.sizeBytes / 1024).toFixed(0)} KB`, `enviado em ${new Date(d.createdAt).toLocaleDateString('pt-BR')}${d.uploadedBy ? ` por ${d.uploadedBy}` : ''}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <a href={`/admin/empresas/arquivo/${d.id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><Download /> Abrir</a>
      {canEdit && (d.archived
        ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(() => archiveCompanyDocAction(v.id, d.id, false))}><ArchiveRestore /> Reativar</Button>
        : <Button variant="ghost" size="sm" disabled={pending} title="Substituído por um mais novo: sai dos alertas e fica no histórico" onClick={() => act(() => archiveCompanyDocAction(v.id, d.id, true))}><Archive /> Arquivar</Button>)}
      {canEdit && <Button variant="ghost" size="sm" disabled={pending} aria-label="Excluir" onClick={() => { if (confirm(`Excluir "${d.filename}" definitivamente? (Para documento substituído, prefira Arquivar.)`)) act(() => deleteCompanyDocAction(v.id, d.id)); }}><Trash2 /></Button>}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-bold text-navy">Situação da pasta</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {v.checklist.map((c) => (
            <li key={c.kind} className={cn('rounded-xl border p-2.5 text-sm', c.state === 'faltando' || c.state === 'vencido' ? 'border-critico/30 bg-critico/5' : c.state === 'vence_em_breve' ? 'border-atencao/30 bg-atencao/5' : 'border-sucesso/25 bg-sucesso/5')}>
              <p className="font-semibold text-tinta">{c.label}</p>
              <p className="mt-0.5 text-xs">{c.state === 'faltando' ? <span className="font-semibold text-critico">faltando</span> : c.state === 'sem_validade' ? <span className="text-sucesso">na pasta</span> : <ValidityBadge state={c.state} daysLeft={c.daysLeft} />}</p>
            </li>
          ))}
        </ul>
      </Card>

      {canEdit && (
        <Card className="p-4">
          <h2 className="font-bold text-navy">Enviar documento</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div className="sm:col-span-2">
              <Label>Tipo</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as CompanyDocKind)}>{COMPANY_DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>
              <p className="mt-0.5 text-[11px] text-tinta-fraca">{def.hint}</p>
            </div>
            <div className="sm:col-span-2"><Label>Descrição (opcional)</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={kind === 'PROCURACAO' ? 'ex.: Procuração — escritório contábil' : kind === 'CERTIDAO' ? 'ex.: CND federal' : ''} /></div>
            <div><Label>Emissão (opcional)</Label><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
            <div><Label>Validade{def.expires ? '' : ' (se houver)'}</Label><Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Observação (opcional)</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>Arquivo (PDF, foto, Word ou Excel, até 6 MB)</Label>
              <input ref={fileRef} type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-nacao/10 file:px-3 file:py-2 file:font-semibold file:text-nacao" />
            </div>
          </div>
          {def.expires && !form.validUntil && <p className="mt-2 text-xs text-atencao">Informe a validade para o sistema avisar 30 dias antes de vencer.</p>}
          <div className="mt-3 flex items-center gap-3">
            <Button disabled={pending || !file} onClick={send}><FileUp /> {pending ? 'Enviando…' : 'Guardar na pasta'}</Button>
            <FormMessage error={msg.error} success={msg.ok} />
          </div>
        </Card>
      )}
      {!canEdit && <FormMessage error={msg.error} success={msg.ok} />}

      {groups.length === 0 && <Card className="p-4 text-sm text-tinta-suave">Pasta vazia.</Card>}
      {groups.map((g) => (
        <Card key={g.id} className="divide-y divide-borda overflow-hidden">
          <p className="bg-fundo px-3 py-2 text-sm font-bold text-navy">{g.label} <span className="font-normal text-tinta-fraca">({g.docs.length})</span></p>
          {g.docs.map((d) => <Doc key={d.id} d={d} />)}
        </Card>
      ))}
      {archived.length > 0 && (
        <Card className="divide-y divide-borda overflow-hidden">
          <button onClick={() => setShowArchived(!showArchived)} className="w-full bg-fundo px-3 py-2 text-left text-sm font-semibold text-tinta-suave">{showArchived ? 'Esconder' : 'Ver'} arquivados ({archived.length})</button>
          {showArchived && archived.map((d) => <Doc key={d.id} d={d} />)}
        </Card>
      )}
    </div>
  );
}
