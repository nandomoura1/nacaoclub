'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { ContractText } from '@/components/contracts/ContractText';
import { FormMessage } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { CONTRACT_CATEGORIES, SIGNER_ROLES, renderContract, type TemplateField } from '@/domain/contracts';
import { previewBuiltinsAction, saveContractAction } from './actions';

export interface FormTemplate { id: string; name: string; category: string; description: string | null; body: string; fields: TemplateField[]; signerRoles: string[] }
interface Signer { role: string; name: string; document: string; phone: string; email: string }
export interface FormInitial { id: string; code: string; templateId: string | null; companyId: string | null; title: string; values: Record<string, string>; notes: string | null; signers: { role: string; name: string; document: string | null; phone: string | null; email: string | null }[] }

const area = 'min-h-20 w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-tinta focus:border-nacao focus:outline-none focus:ring-2 focus:ring-nacao/20';
const blank = (role: string): Signer => ({ role, name: '', document: '', phone: '', email: '' });

export function ContractForm({ templates, companies, initial }: { templates: FormTemplate[]; companies: { id: string; name: string }[]; initial: FormInitial | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [templateId, setTemplateId] = useState(initial?.templateId ?? '');
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [values, setValues] = useState<Record<string, string>>(initial?.values ?? {});
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [signers, setSigners] = useState<Signer[]>(
    initial?.signers.map((s) => ({ role: s.role, name: s.name, document: s.document ?? '', phone: s.phone ?? '', email: s.email ?? '' })) ?? [],
  );
  const [builtins, setBuiltins] = useState<Record<string, string>>({});
  const t = templates.find((x) => x.id === templateId);

  useEffect(() => {
    let alive = true;
    previewBuiltinsAction(companyId || null, initial?.code ?? null).then((r) => { if (alive && r.ok) setBuiltins(r.data); });
    return () => { alive = false; };
  }, [companyId, initial?.code]);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const nt = templates.find((x) => x.id === id);
    if (nt && (!signers.length || confirm('Trocar o modelo refaz a lista de quem assina. Continuar?'))) setSigners(nt.signerRoles.map(blank));
  };

  const preview = useMemo(() => (t ? renderContract(t.body, t.fields, values, builtins) : null), [t, values, builtins]);
  const setSigner = (i: number, patch: Partial<Signer>) => setSigners((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () => start(async () => {
    const r = await saveContractAction(initial?.id ?? null, {
      templateId, companyId: companyId || null, title, values, notes: notes || null,
      signers: signers.map((s) => ({ role: s.role, name: s.name, document: s.document || null, phone: s.phone || null, email: s.email || null })),
    });
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.message });
    if (!initial) router.push(`/contratos/${r.data}`); else router.refresh();
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl">Modelo</Label>
              <Select id="tpl" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                <option value="">Escolha o modelo…</option>
                {CONTRACT_CATEGORIES.map((c) => {
                  const list = templates.filter((x) => x.category === c.id);
                  return list.length ? <optgroup key={c.id} label={c.label}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null;
                })}
              </Select>
            </div>
            <div>
              <Label htmlFor="emp">Empresa (contratante)</Label>
              <Select id="emp" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— sem empresa —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </div>
          {t?.description && <p className="text-xs text-tinta-suave">{t.description}</p>}
          <div>
            <Label htmlFor="title">Título do contrato</Label>
            <Input id="title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: João Silva — aulas de Beach Tennis" />
          </div>
        </Card>

        {t && (
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-extrabold text-navy">Campos do contrato</h2>
            {t.fields.length === 0 && <p className="text-sm text-tinta-suave">Este modelo não tem campos variáveis.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {t.fields.map((f) => {
                const v = values[f.key] ?? '';
                const on = (val: string) => setValues((s) => ({ ...s, [f.key]: val }));
                return (
                  <div key={f.key} className={f.type === 'texto_longo' ? 'sm:col-span-2' : ''}>
                    <Label htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="text-critico"> *</span>}</Label>
                    {f.type === 'texto_longo'
                      ? <textarea id={`f-${f.key}`} className={area} value={v} onChange={(e) => on(e.target.value)} />
                      : <Input id={`f-${f.key}`} type={f.type === 'data' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                          inputMode={f.type === 'moeda' ? 'decimal' : f.type === 'numero' || f.type === 'cpf_cnpj' ? 'numeric' : f.type === 'telefone' ? 'tel' : undefined}
                          placeholder={f.type === 'moeda' ? '1.500,00' : f.type === 'cpf_cnpj' ? 'CPF ou CNPJ' : undefined}
                          value={v} onChange={(e) => on(e.target.value)} />}
                    {f.help && <p className="mt-1 text-[11px] text-tinta-fraca">{f.help}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {t && (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-navy">Quem assina</h2>
              <Button size="sm" variant="secondary" onClick={() => setSigners((s) => [...s, blank('TESTEMUNHA')])} disabled={signers.length >= 8}><Plus /> Parte</Button>
            </div>
            <p className="text-xs text-tinta-suave">Cada parte recebe um link próprio no WhatsApp e assina com um código. O nome digitado na assinatura precisa ser igual ao daqui.</p>
            {signers.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-xl bg-fundo p-3 sm:grid-cols-2">
                <div className="flex items-end gap-2 sm:col-span-2">
                  <div className="w-48">
                    <Label>Papel</Label>
                    <Select value={s.role} onChange={(e) => setSigner(i, { role: e.target.value })}>{SIGNER_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
                  </div>
                  <div className="flex-1">
                    <Label>Nome completo</Label>
                    <Input value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} />
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Remover parte" onClick={() => setSigners((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
                <div><Label>WhatsApp *</Label><Input inputMode="tel" placeholder="(61) 99999-9999" value={s.phone} onChange={(e) => setSigner(i, { phone: e.target.value })} /></div>
                <div><Label>CPF/CNPJ</Label><Input inputMode="numeric" value={s.document} onChange={(e) => setSigner(i, { document: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>E-mail (opcional)</Label><Input type="email" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} /></div>
              </div>
            ))}
          </Card>
        )}

        <Card className="space-y-3 p-4">
          <div>
            <Label htmlFor="notes">Observações internas (não vão no contrato)</Label>
            <textarea id="notes" className={area} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <FormMessage error={msg.error} success={msg.success} />
          <Button onClick={save} disabled={pending || !templateId}>{initial ? 'Salvar alterações' : 'Salvar rascunho'}</Button>
        </Card>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-navy">Prévia do contrato</h2>
            {preview && preview.errors.length > 0 && <span className="text-xs font-semibold text-atencao">{preview.errors.length} campo(s) a preencher</span>}
          </div>
          {preview ? (
            <>
              {preview.errors.length > 0 && <ul className="mb-3 list-disc space-y-0.5 rounded-lg bg-atencao/10 py-2 pl-7 pr-3 text-xs text-atencao">{preview.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>}
              <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-borda p-4"><ContractText text={preview.text} /></div>
            </>
          ) : <p className="text-sm text-tinta-suave">Escolha um modelo para ver o contrato montado.</p>}
        </Card>
      </div>
    </div>
  );
}
