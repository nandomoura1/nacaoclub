'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { parseBRL } from '@/domain/condominio/money';
import {
  CASH_KINDS, CLASSIFICATIONS, DATASETS, PAYMENT_METHODS, PDV_SUMMARY_KEYS, PRODUCT_GROUPS, SIGNED_ACCOUNT_CLASSES, SUMMARY_INDICATORS, type Dataset,
} from '@/domain/financeiro/taxonomy';
import { brl } from './fmt';

/** Linha editável (conferência e importação de relatório antigo). */
export interface LineDraft {
  dataset: Dataset;
  key: string | null;
  label: string;
  unit: string | null;
  amountCents: number | null;
  quantity: number | null;
  classification: string | null;
  meta: Record<string, unknown> | null;
}
export type CategoryOption = { key: string; label: string; kind: 'RECEITA' | 'DESPESA'; active: boolean };

const PDV_LABELS: Record<string, string> = { faturamento: 'Faturamento', vendas: 'Nº de vendas', cancelamentos: 'Cancelamentos', estornos: 'Estornos', estoque_inicial: 'Estoque inicial', estoque_final: 'Estoque final' };

/** Chaves válidas por tipo de dado (o motor só reconhece estas). */
export function keyOptions(ds: Dataset, categories: CategoryOption[]): { key: string; label: string }[] | null {
  switch (ds) {
    case 'RECEITA': return categories.filter((c) => c.kind === 'RECEITA' && c.active);
    case 'DESPESA': return categories.filter((c) => c.kind === 'DESPESA' && c.active);
    case 'PDV_RESUMO': return PDV_SUMMARY_KEYS.map((k) => ({ key: k, label: PDV_LABELS[k] ?? k }));
    case 'PDV_PAGAMENTO': return PAYMENT_METHODS;
    case 'PDV_PRODUTO': return PRODUCT_GROUPS;
    case 'CAIXA': return [...CASH_KINDS];
    case 'INDICADOR': return SUMMARY_INDICATORS;
    default: return null;
  }
}
export const keyLabel = (ds: Dataset, key: string | null, categories: CategoryOption[]) =>
  (key && keyOptions(ds, categories)?.find((o) => o.key === key)?.label) || key || null;
export const datasetLabel = (ds: string) => DATASETS.find((d) => d.id === ds)?.label ?? ds;
const UNIT_HINT: Partial<Record<Dataset, string>> = { ALUNOS: 'Modalidade', MODALIDADE: 'Modalidade', CAIXA: 'Banco / conta', PDV_PRODUTO: 'Unidade' };

/** Valor da linha como texto: R$ e/ou quantidade (percentuais de indicador em %). */
export function lineValue(l: Pick<LineDraft, 'dataset' | 'key' | 'amountCents' | 'quantity'>) {
  const unit = l.dataset === 'INDICADOR' ? SUMMARY_INDICATORS.find((s) => s.key === l.key)?.unit : null;
  const parts: string[] = [];
  if (l.amountCents !== null) parts.push(brl(l.amountCents));
  if (l.quantity !== null) parts.push(unit === 'PCT' ? `${l.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : `${l.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${l.dataset === 'ALUNOS' ? ' alunos' : l.amountCents !== null ? ' un.' : ''}`);
  return parts.join(' · ') || '—';
}

const toNum = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const money = (c: number | null) => (c === null ? '' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Formulário de uma linha. `needReason` pede o motivo (competência já aprovada). */
export function LineForm({ initial, categories, needReason, onSave, onCancel, pending, submitLabel = 'Salvar' }: {
  initial: LineDraft; categories: CategoryOption[]; needReason?: boolean; pending?: boolean; submitLabel?: string;
  onSave: (l: LineDraft, reason: string | null) => void; onCancel: () => void;
}) {
  const [ds, setDs] = useState<Dataset>(initial.dataset);
  const [key, setKey] = useState(initial.key ?? '');
  const [label, setLabel] = useState(initial.label);
  const [unit, setUnit] = useState(initial.unit ?? '');
  const [amount, setAmount] = useState(money(initial.amountCents));
  const [qty, setQty] = useState(initial.quantity === null ? '' : String(initial.quantity).replace('.', ','));
  const [cls, setCls] = useState(initial.classification ?? '');
  const [caClass, setCaClass] = useState(String(initial.meta?.contaAssinadaClasse ?? ''));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const opts = keyOptions(ds, categories);
  const submit = () => {
    const amountCents = amount.trim() ? parseBRL(amount) : null;
    const quantity = toNum(qty);
    if (amount.trim() && amountCents === null) return setErr('Valor em R$ inválido.');
    if (Number.isNaN(quantity)) return setErr('Quantidade inválida.');
    if (amountCents === null && quantity === null) return setErr('Informe um valor ou uma quantidade.');
    if (!label.trim()) return setErr('Informe o rótulo.');
    if (needReason && reason.trim().length < 3) return setErr('Informe o motivo (a competência já foi aprovada).');
    const meta: Record<string, unknown> = { ...(initial.meta ?? {}) };
    if (ds === 'PDV_PAGAMENTO' && key === 'conta_assinada' && caClass) meta.contaAssinadaClasse = caClass; else delete meta.contaAssinadaClasse;
    onSave({ dataset: ds, key: key || null, label: label.trim(), unit: unit.trim() || null, amountCents, quantity: quantity as number | null, classification: cls || null, meta: Object.keys(meta).length ? meta : null }, needReason ? reason.trim() : null);
  };
  return (
    <div className="grid gap-2 rounded-lg border border-nacao/30 bg-nacao/5 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
      <div><Label>Tipo de dado</Label><Select value={ds} onChange={(e) => { setDs(e.target.value as Dataset); setKey(''); }}>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></div>
      <div><Label>{opts ? 'Categoria / chave' : 'Chave (opcional)'}</Label>
        {opts ? <Select value={key} onChange={(e) => setKey(e.target.value)}><option value="">— sem categoria —</option>{opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</Select>
          : <Input value={key} onChange={(e) => setKey(e.target.value)} />}
      </div>
      <div className="sm:col-span-2"><Label>Rótulo (como está no documento)</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <div><Label>{UNIT_HINT[ds] ?? 'Detalhe (opcional)'}</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
      <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
      <div><Label>Quantidade{ds === 'INDICADOR' ? ' / %' : ''}</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      <div><Label>Classificação</Label><Select value={cls} onChange={(e) => setCls(e.target.value)}><option value="">—</option>{CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}</Select></div>
      {ds === 'PDV_PAGAMENTO' && key === 'conta_assinada' && (
        <div><Label>Conta Assinada é…</Label><Select value={caClass} onChange={(e) => setCaClass(e.target.value)}><option value="">não classificada</option>{SIGNED_ACCOUNT_CLASSES.map((c) => <option key={c}>{c}</option>)}</Select></div>
      )}
      {needReason && <div className="sm:col-span-2 lg:col-span-3"><Label>Motivo da alteração (obrigatório)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: folha corrigida pela contabilidade" /></div>}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button size="sm" disabled={pending} onClick={submit}><Check /> {submitLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X /> Cancelar</Button>
        {err && <span className="text-xs font-semibold text-critico">{err}</span>}
      </div>
    </div>
  );
}
