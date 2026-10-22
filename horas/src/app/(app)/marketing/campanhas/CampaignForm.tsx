'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { parseBRL } from '@/domain/condominio/money';
import { CAMPAIGN_TYPES, CHANNELS, CONVERSION_CHANNELS, isCommercial } from '@/domain/marketing/constants';
import { cn } from '@/lib/cn';
import type { CampaignView, MktOptions } from '@/server/services/marketing-service';
import { saveCampaignAction } from '../actions';

type Data = CampaignView['data'];
const EMPTY: Data = {
  name: '', type: 'EVENTO', objective: null, audience: null, product: null, offer: null, message: null, cta: null, channels: [], conversionChannel: null,
  conversionUrl: null, leadOwnerId: null, measurement: null, goal: null, kpis: null, startDate: '', endDate: null, budgetCents: null, ownerId: null,
  participantIds: [], modalityId: null, eventId: null, details: null, notes: null,
};

/** Briefing da campanha. Campos comerciais aparecem destacados nos tipos que vendem. */
export function CampaignForm({ id, initial, options, canEdit, defaults }: { id: string | null; initial: Data | null; options: MktOptions; canEdit: boolean; defaults?: Partial<Data> }) {
  const router = useRouter();
  const [d, setD] = useState<Data>({ ...EMPTY, ...defaults, ...(initial ?? {}) });
  const [budget, setBudget] = useState(initial?.budgetCents ? (initial.budgetCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  const [msg, setMsg] = useState<{ error?: string | null; ok?: string | null }>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof Data>(k: K, v: Data[K]) => { setD((cur) => ({ ...cur, [k]: v })); setMsg({}); };
  const commercial = isCommercial(d.type);
  const txt = (k: keyof Data, label: string, opts: { area?: boolean; wide?: boolean; placeholder?: string; type?: string } = {}) => (
    <div className={cn(opts.wide && 'sm:col-span-2')}>
      <Label>{label}</Label>
      {opts.area
        ? <textarea className="min-h-16 w-full rounded-lg border border-borda p-2 text-sm" value={(d[k] as string | null) ?? ''} disabled={!canEdit} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
        : <Input type={opts.type} value={(d[k] as string | null) ?? ''} disabled={!canEdit} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />}
    </div>
  );
  const toggleChannel = (k: string) => set('channels', d.channels.includes(k) ? d.channels.filter((x) => x !== k) : [...d.channels, k]);
  const save = () => start(async () => {
    const cents = budget.trim() ? parseBRL(budget) : null;
    if (budget.trim() && cents === null) return setMsg({ error: 'Orçamento inválido.' });
    const r = await saveCampaignAction(id, { ...d, budgetCents: cents, endDate: d.endDate ?? '' });
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok: r.message });
    if (!id) router.push(`/marketing/campanhas/${r.data}`);
    else router.refresh();
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-bold text-navy">Briefing</h2>
        <p className="text-xs text-tinta-suave">O que vamos comunicar, para quem, quando e com qual objetivo?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {txt('name', 'Nome da campanha', { wide: true })}
          <div><Label>Tipo</Label><Select value={d.type} disabled={!canEdit} onChange={(e) => set('type', e.target.value as Data['type'])}>{CAMPAIGN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></div>
          <div><Label>Responsável</Label><Select value={d.ownerId ?? ''} disabled={!canEdit} onChange={(e) => set('ownerId', e.target.value || null)}><option value="">—</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          {txt('startDate', 'Início', { type: 'date' })}
          {txt('endDate', 'Fim (opcional)', { type: 'date' })}
          <div><Label>Evento vinculado</Label><Select value={d.eventId ?? ''} disabled={!canEdit} onChange={(e) => set('eventId', e.target.value || null)}><option value="">—</option>{options.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></div>
          <div><Label>Modalidade</Label><Select value={d.modalityId ?? ''} disabled={!canEdit} onChange={(e) => set('modalityId', e.target.value || null)}><option value="">Nação (geral)</option>{options.modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></div>
          {txt('objective', 'Objetivo', { area: true, wide: true })}
          {txt('audience', 'Público', { area: true, wide: true })}
          {txt('message', 'Mensagem principal', { area: true, wide: true })}
          {txt('cta', 'CTA (chamada para ação)', { wide: true, placeholder: 'ex.: Garanta sua vaga' })}
          {txt('product', 'Produto', {})}
          <div><Label>Orçamento (R$)</Label><Input value={budget} disabled={!canEdit} onChange={(e) => setBudget(e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
          {txt('goal', 'Meta', { wide: true, placeholder: 'ex.: 300 inscritos' })}
          {txt('kpis', 'KPIs', { wide: true, placeholder: 'ex.: inscrições, alcance, CPL' })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-navy">Como funciona</h2>
        <p className="text-xs text-tinta-suave">Modalidades, horários, número de vagas, regras, o que levar… Vai inteiro no <b>Briefing do WhatsApp</b> e no <b>Comunicar a equipe</b>.</p>
        <textarea className="mt-3 min-h-40 w-full rounded-lg border border-borda p-2 text-sm" value={d.details ?? ''} disabled={!canEdit} maxLength={4000}
          placeholder={'ex.:\n🔥 AULÃO HYROX — 7h, 8h, 9h e 10h · 24 vagas por horário\n🏐 FUTEVÔLEI — 9h às 12h · inscrição em dupla\nCheck-in pelo Tecnofit até a véspera'}
          onChange={(e) => set('details', e.target.value)} />
        <p className="text-right text-[11px] text-tinta-fraca">{(d.details ?? '').length}/4000 · *negrito* funciona no WhatsApp</p>
      </Card>

      <Card className={cn('p-4', commercial && 'border-nacao/30')}>
        <h2 className="font-bold text-navy">Conversão {commercial && <span className="ml-1 rounded-full bg-nacao/10 px-2 py-0.5 text-[11px] font-semibold text-nacao">obrigatório para ativar</span>}</h2>
        <p className="text-xs text-tinta-suave">Onde o cliente realiza a ação? Quem recebe o lead? Como o resultado será medido?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {txt('offer', commercial ? 'Oferta' : 'Oferta (se houver)', { wide: true })}
          <div><Label>Canal de conversão</Label><Select value={d.conversionChannel ?? ''} disabled={!canEdit} onChange={(e) => set('conversionChannel', e.target.value || null)}><option value="">—</option>{CONVERSION_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></div>
          {txt('conversionUrl', 'Link de conversão', { placeholder: 'https://…' })}
          <div><Label>Responsável pelo lead</Label><Select value={d.leadOwnerId ?? ''} disabled={!canEdit} onChange={(e) => set('leadOwnerId', e.target.value || null)}><option value="">—</option>{options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          {txt('measurement', 'Como medir', { wide: true, placeholder: 'ex.: UTM + formulário de inscrição' })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-navy">Canais</h2>
        <p className="text-xs text-tinta-suave">Onde comunicar? Inclua ao menos um canal interno — todo mundo que precisa saber, fica sabendo.</p>
        {(['EXTERNO', 'INTERNO'] as const).map((g) => (
          <div key={g} className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-tinta-suave">{g === 'EXTERNO' ? 'Externos' : 'Internos'}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CHANNELS.filter((c) => c.group === g).map((c) => (
                <button key={c.key} type="button" disabled={!canEdit} onClick={() => toggleChannel(c.key)}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1', d.channels.includes(c.key) ? 'bg-nacao text-white ring-nacao' : 'bg-white text-tinta-suave ring-borda hover:text-tinta')}>{c.label}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3">{txt('notes', 'Observações internas (não vão para a equipe)', { area: true, wide: true })}</div>
      </Card>

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button disabled={pending} onClick={save}><Save /> {pending ? 'Salvando…' : id ? 'Salvar briefing' : 'Criar campanha'}</Button>
          <FormMessage error={msg.error} success={msg.ok} />
        </div>
      )}
    </div>
  );
}
