'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, Plus, Trash2, Wand2 } from 'lucide-react';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { BUILTIN_VARS, CONTRACT_CATEGORIES, companyLiterals, replaceCompanyLiterals, type CompanyLike, FIELD_TYPES, SIGNER_ROLES, checkTemplate, roleLabel, suggestFields, type FieldType, type TemplateField } from '@/domain/contracts';
import type { TemplateRow } from '@/server/services/contract-service';
import { loadDefaultTemplatesAction, saveTemplateAction } from '../actions';

interface Draft { id: string | null; name: string; category: string; description: string; body: string; fields: TemplateField[]; signerRoles: string[]; active: boolean }
const empty: Draft = { id: null, name: '', category: 'PRESTADOR', description: '', body: '# CONTRATO DE …\n\n**CONTRATANTE:** {{empresa_razao_social}}, CNPJ {{empresa_cnpj}}…\n\n## Cláusula 1ª — Objeto\n\n…', fields: [], signerRoles: ['CONTRATANTE', 'CONTRATADO'], active: true };

export function TemplatesClient({ templates, companies, canEdit }: { templates: TemplateRow[]; companies: CompanyLike[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [d, setD] = useState<Draft | null>(null);
  const problems = useMemo(() => (d ? checkTemplate(d.body, d.fields) : []), [d]);
  const literals = useMemo(() => (d ? companyLiterals(d.body, companies) : []), [d, companies]);
  const set = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));
  const setField = (i: number, p: Partial<TemplateField>) => set({ fields: d!.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });

  const loadDefaults = () => start(async () => {
    const r = await loadDefaultTemplatesAction();
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.data.length ? `Carregados: ${r.data.join('; ')}.` : 'Os modelos iniciais já estavam cadastrados.' });
    router.refresh();
  });
  const save = () => start(async () => {
    if (!d) return;
    const { id, ...input } = d;
    const r = await saveTemplateAction(id, { ...input, description: input.description || null });
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ success: r.message }); setD(null); router.refresh();
  });

  if (d) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div><Label>Nome do modelo</Label><Input value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></div>
            <div><Label>Categoria</Label><Select value={d.category} onChange={(e) => set({ category: e.target.value })}>{CONTRACT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></div>
          </div>
          <div><Label>Descrição (para quem escolhe o modelo)</Label><Input value={d.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} /></div>
          <div>
            <Label>Quem assina</Label>
            <div className="flex flex-wrap gap-2">
              {SIGNER_ROLES.map((r) => {
                const on = d.signerRoles.includes(r.id);
                return <button key={r.id} type="button" onClick={() => set({ signerRoles: on ? d.signerRoles.filter((x) => x !== r.id) : [...d.signerRoles, r.id] })} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${on ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta-suave ring-borda'}`}>{r.label}</button>;
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-nacao" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Ativo (aparece para criar contratos)</label>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-navy">Texto do contrato</h2>
            <span className="text-xs text-tinta-suave"># título · ## cláusula · - item · **negrito** · | tabela | · --- · {'{{campo}}'}</span>
          </div>
          {literals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-atencao/10 px-3 py-2 text-xs text-atencao">
              <span className="flex-1"><b>Dados de empresa escritos à mão:</b> {literals.join(' · ')}. Assim, trocar a empresa no contrato não muda o texto. Use {'{{empresa_razao_social}}'}, {'{{empresa_cnpj}}'}, {'{{empresa_endereco}}'} e {'{{empresa_nome}}'}.</span>
              <Button size="sm" variant="secondary" onClick={() => set({ body: replaceCompanyLiterals(d.body, companies) })}>Trocar nome e CNPJ por variáveis</Button>
            </div>
          )}
          <textarea className="min-h-[28rem] w-full rounded-lg border border-borda p-3 font-mono text-xs leading-relaxed focus:border-nacao focus:outline-none" value={d.body} onChange={(e) => set({ body: e.target.value })} />
          <p className="text-xs text-tinta-suave">Variáveis do sistema (preenchidas sozinhas): {BUILTIN_VARS.map((b) => <code key={b.key} className="mr-1 rounded bg-fundo px-1">{`{{${b.key}}}`}</code>)}</p>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-navy">Campos que a pessoa preenche</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => set({ fields: suggestFields(d.body, d.fields) })}><Wand2 /> Ler campos do texto</Button>
              <Button size="sm" variant="secondary" onClick={() => set({ fields: [...d.fields, { key: '', label: '', type: 'texto', required: true }] })}><Plus /> Campo</Button>
            </div>
          </div>
          {d.fields.map((f, i) => (
            <div key={i} className="grid items-end gap-2 rounded-xl bg-fundo p-2 sm:grid-cols-[10rem_minmax(0,1fr)_9rem_auto_auto]">
              <div><Label>Chave</Label><Input className="font-mono text-xs" value={f.key} onChange={(e) => setField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></div>
              <div><Label>Rótulo</Label><Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></div>
              <div><Label>Tipo</Label><Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>{FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></div>
              <label className="flex h-10 items-center gap-1 text-xs"><input type="checkbox" className="accent-nacao" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Obrigatório</label>
              <Button size="sm" variant="ghost" aria-label="Remover campo" onClick={() => set({ fields: d.fields.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          {problems.length > 0 && <ul className="list-disc space-y-0.5 rounded-lg bg-atencao/10 py-2 pl-7 pr-3 text-xs text-atencao">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </Card>

        <FormMessage error={msg.error} success={msg.success} />
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending || problems.length > 0}>Salvar modelo</Button>
          <Button variant="ghost" onClick={() => { setD(null); setMsg({}); }}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setD(empty); setMsg({}); }}><FilePlus2 /> Novo modelo</Button>
          <Button variant="secondary" disabled={pending} onClick={loadDefaults}>Carregar modelos iniciais</Button>
        </div>
      )}
      <FormMessage error={msg.error} success={msg.success} />
      {templates.length === 0 ? (
        <Card className="p-6 text-sm text-tinta-suave">Nenhum modelo ainda. {canEdit && 'Use "Carregar modelos iniciais" para começar com os 5 modelos-base (professor PJ/MEI, banco de horas CLT, estágio, fornecedor e espaço de marketing).'}</Card>
      ) : (
        <Card className="divide-y divide-borda">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-tinta">{t.name}</p>
                <p className="text-xs text-tinta-suave">{CONTRACT_CATEGORIES.find((c) => c.id === t.category)?.label} · {t.fields.length} campos · assinam: {t.signerRoles.map(roleLabel).join(', ')} · {t.uses} contrato(s)</p>
              </div>
              {!t.active && <Badge>Inativo</Badge>}
              {canEdit && <Button size="sm" variant="secondary" onClick={() => { setD({ id: t.id, name: t.name, category: t.category, description: t.description ?? '', body: t.body, fields: t.fields, signerRoles: t.signerRoles, active: t.active }); setMsg({}); }}>Editar</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
