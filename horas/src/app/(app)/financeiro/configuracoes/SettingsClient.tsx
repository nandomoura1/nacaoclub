'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { parseBRL } from '@/domain/condominio/money';
import type { Targets } from '@/domain/financeiro/metrics';
import { CLASSIFICATIONS, type CategoryDef } from '@/domain/financeiro/taxonomy';
import { saveCategoryAction, saveTargetsAction } from '../actions';

type Cat = CategoryDef & { active: boolean };
const str = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function SettingsClient({ targets, categories }: { targets: Targets; categories: Cat[] }) {
  const router = useRouter();
  const [t, setT] = useState({
    cmvMaxPct: str(targets.cmvMaxPct), personnelMaxPct: str(targets.personnelMaxPct),
    cashMin: targets.cashMinCents === null ? '' : (targets.cashMinCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    payrollVarAlertPct: str(targets.payrollVarAlertPct), cmvVarAlertPp: str(targets.cmvVarAlertPp), tennisSharePct: str(targets.tennisSharePct),
  });
  const [payoutInFlow, setPayoutInFlow] = useState(targets.payoutInFlow);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message });
    after?.();
    router.refresh();
  });
  const field = (k: keyof typeof t, label: string, hint: string) => (
    <div><Label>{label}</Label><Input inputMode="decimal" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /><p className="mt-0.5 text-[11px] text-tinta-fraca">{hint}</p></div>
  );
  const saveTargets = () => run(() => saveTargetsAction({
    cmvMaxPct: num(t.cmvMaxPct), personnelMaxPct: num(t.personnelMaxPct), cashMinCents: t.cashMin.trim() ? parseBRL(t.cashMin) : null,
    payrollVarAlertPct: num(t.payrollVarAlertPct), cmvVarAlertPp: num(t.cmvVarAlertPp), tennisSharePct: num(t.tennisSharePct), payoutInFlow,
  }));
  const blank: Cat = { key: '', label: '', kind: 'DESPESA', classification: 'OPEX', personnel: false, operatingRevenue: false, sortOrder: 0, active: true };

  return (
    <div className="space-y-4">
      <FormMessage error={msg.error} success={msg.ok} />
      <Card className="p-4">
        <h2 className="font-bold text-navy">Metas e alertas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {field('cmvMaxPct', 'CMV máximo (%)', 'Alerta quando o CMV passar disso. Vazio = sem meta.')}
          {field('personnelMaxPct', 'Pessoal máximo (% dos recebimentos)', 'Vazio = sem meta.')}
          {field('cashMin', 'Caixa mínimo (R$)', 'Alerta quando o caixa disponível ficar abaixo. Vazio = sem meta.')}
          {field('payrollVarAlertPct', 'Variação da folha que gera alerta (%)', 'Comparado ao último mês aprovado.')}
          {field('cmvVarAlertPp', 'Variação do CMV que gera alerta (p.p.)', 'Comparado ao último mês aprovado.')}
          {field('tennisSharePct', 'Repasse do Tênis pelo contrato (%)', 'Usado para conferir o repasse ao parceiro.')}
          <div className="sm:col-span-2">
            <Label>Geração de caixa antes do payout desconta…</Label>
            <Select value={payoutInFlow} onChange={(e) => setPayoutInFlow(e.target.value as Targets['payoutInFlow'])}>
              <option value="distribuicao">Só a distribuição de lucros (metodologia do relatório de agosto/2026)</option>
              <option value="total">Todo o payout (distribuição + antecipação + retiradas)</option>
            </Select>
            <p className="mt-0.5 text-[11px] text-tinta-fraca">Vale para os relatórios e o painel. Versões já aprovadas guardam o cálculo da época.</p>
          </div>
        </div>
        <Button className="mt-3" size="sm" disabled={pending} onClick={saveTargets}><Save /> Salvar metas</Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-borda p-3">
          <h2 className="flex-1 font-bold text-navy">Categorias</h2>
          <Button size="sm" variant="secondary" onClick={() => setEditing('__new')}><Plus /> Nova categoria</Button>
        </div>
        {editing === '__new' && <div className="border-b border-borda p-3"><CategoryForm c={blank} isNew pending={pending} onCancel={() => setEditing(null)} onSave={(c) => run(() => saveCategoryAction(c), () => setEditing(null))} /></div>}
        {(['RECEITA', 'DESPESA'] as const).map((kind) => (
          <div key={kind}>
            <p className="bg-fundo px-3 py-1 text-xs font-bold uppercase tracking-wide text-tinta-suave">{kind === 'RECEITA' ? 'Recebimentos' : 'Pagamentos'}</p>
            <ul className="divide-y divide-borda">
              {categories.filter((c) => c.kind === kind).map((c) => (
                <li key={c.key} className="p-2 text-sm">
                  {editing === c.key ? <CategoryForm c={c} pending={pending} onCancel={() => setEditing(null)} onSave={(v) => run(() => saveCategoryAction(v), () => setEditing(null))} /> : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1"><b className={c.active ? 'text-tinta' : 'text-tinta-fraca line-through'}>{c.label}</b> <span className="text-xs text-tinta-fraca">{c.key}</span></span>
                      <Badge>{c.classification}</Badge>
                      {c.personnel && <Badge tone="blue">pessoal</Badge>}
                      {kind === 'RECEITA' && !c.operatingRevenue && <Badge tone="amber">não operacional</Badge>}
                      {!c.active && <Badge tone="neutral">inativa</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c.key)} aria-label="Editar"><Pencil /></Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </div>
  );
}

function CategoryForm({ c, isNew, pending, onSave, onCancel }: { c: Cat; isNew?: boolean; pending: boolean; onSave: (c: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState(c);
  return (
    <div className="grid gap-2 rounded-lg border border-nacao/30 bg-nacao/5 p-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
      <div><Label>Chave</Label><Input value={v.key} disabled={!isNew} onChange={(e) => setV({ ...v, key: e.target.value })} placeholder="desp.seguranca" /></div>
      <div><Label>Nome</Label><Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></div>
      <div><Label>Tipo</Label><Select value={v.kind} disabled={!isNew} onChange={(e) => setV({ ...v, kind: e.target.value as Cat['kind'], personnel: false })}><option value="RECEITA">Recebimento</option><option value="DESPESA">Pagamento</option></Select></div>
      <div><Label>Classificação</Label><Select value={v.classification} onChange={(e) => setV({ ...v, classification: e.target.value as Cat['classification'] })}>{CLASSIFICATIONS.map((x) => <option key={x}>{x}</option>)}</Select></div>
      <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-4">
        {v.kind === 'DESPESA' && <label className="flex items-center gap-1"><input type="checkbox" checked={v.personnel} onChange={(e) => setV({ ...v, personnel: e.target.checked })} /> entra no custo de pessoal</label>}
        {v.kind === 'RECEITA' && <label className="flex items-center gap-1"><input type="checkbox" checked={v.operatingRevenue} onChange={(e) => setV({ ...v, operatingRevenue: e.target.checked })} /> receita operacional</label>}
        <label className="flex items-center gap-1"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> ativa</label>
        <span className="flex-1" />
        <Button size="sm" disabled={pending} onClick={() => onSave({ key: v.key, label: v.label, kind: v.kind, classification: v.classification, personnel: v.personnel, operatingRevenue: v.operatingRevenue, active: v.active })}><Save /> Salvar</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X /> Cancelar</Button>
      </div>
    </div>
  );
}
