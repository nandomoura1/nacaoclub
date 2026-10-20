'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, Copy, Eye, MessageCircle, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Label } from '@/components/ui/input';
import type { IsoDate } from '@/domain/dates';
import { briefingText, hasCommercial, type BriefingInput, type BriefingTasks } from '@/domain/marketing/briefing';
import { cn } from '@/lib/cn';
import type { TeamMember } from '@/server/services/mkt-briefing-service';
import { briefingAudienceAction, sendBriefingAction } from '../../../briefing-actions';

type Audience = { total: number; comTelefone: number; semTelefone: string[]; teste: number | null };
const TASK_OPTS: { id: BriefingTasks; label: string }[] = [
  { id: 'pendentes', label: 'Só as pendentes' },
  { id: 'todas', label: 'Todas' },
  { id: 'nenhuma', label: 'Sem tarefas' },
];

export function BriefingClient({ input, team, link, roles, today, whatsapp, canSend }: {
  input: BriefingInput; team: TeamMember[]; link: string | null; roles: { key: string; name: string }[]; today: IsoDate;
  whatsapp: { configured: boolean; testMode: boolean }; canSend: boolean;
}) {
  const commercialOk = hasCommercial(input);
  const [tasks, setTasks] = useState<BriefingTasks>('pendentes');
  const [commercial, setCommercial] = useState(commercialOk);
  const [withLink, setWithLink] = useState(!!link);
  const generated = useMemo(() => briefingText(input, { tasks, commercial, link: withLink ? link : null }, today), [input, tasks, commercial, withLink, link, today]);
  const [text, setText] = useState(generated);
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setText(generated); }, [generated, edited]);
  const [copied, setCopied] = useState(false);

  const [userIds, setUserIds] = useState<string[]>(team.filter((m) => m.hasPhone).map((m) => m.id));
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [numbers, setNumbers] = useState('');
  const [askOk, setAskOk] = useState(true);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [msg, setMsg] = useState<{ ok?: string | null; error?: string | null }>({});
  const [pending, start] = useTransition();
  const pick = () => ({ userIds, roleKeys, numbers: numbers.split(/\n|,|;/).map((x) => x.trim()).filter(Boolean) });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setMsg({ error: 'Não deu para copiar automaticamente — selecione o texto e copie.' }); }
  };
  const checkAudience = () => start(async () => {
    setMsg({}); const r = await briefingAudienceAction(pick());
    if (r.ok) setAudience(r.data); else setMsg({ error: r.error });
  });
  const send = () => {
    if (!confirm('Enviar o briefing por WhatsApp agora? Cada pessoa recebe uma mensagem e o envio fica registrado em Comunicação Interna.')) return;
    start(async () => {
      setMsg({});
      const r = await sendBriefingAction(input.id, { ...pick(), text, askConfirmation: askOk });
      if (!r.ok) { setMsg({ error: r.error }); return; }
      const s = r.data;
      setMsg({ ok: !s ? 'Briefing publicado.' : s.erro ? `Registrado em Comunicação Interna, mas o WhatsApp falhou: ${s.erro}` : `Briefing enviado: ${s.enviados} WhatsApp${s.falhas ? `, ${s.falhas} falha(s)` : ''}${s.semTelefone.length ? `, ${s.semTelefone.length} sem número` : ''}${s.limitadoTeste ? ` (modo teste: ${s.limitadoTeste} não enviados)` : ''}. Acompanhe os “OK” em Comunicação Interna.` });
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Card className="p-4">
          <h2 className="font-bold text-navy">1. Monte o briefing</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <Label>Tarefas</Label>
              <div className="flex flex-wrap gap-2">
                {TASK_OPTS.map((o) => (
                  <button key={o.id} type="button" onClick={() => setTasks(o.id)}
                    className={cn('rounded-full border px-3 py-1 text-xs font-semibold', tasks === o.id ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{o.label}</button>
                ))}
              </div>
              {input.tasks.length === 0 && <p className="mt-1 text-xs text-tinta-suave">Esta campanha ainda não tem tarefas.</p>}
            </div>
            <label className={cn('flex items-center gap-2', !commercialOk && 'opacity-50')}>
              <input type="checkbox" disabled={!commercialOk} checked={commercial && commercialOk} onChange={(e) => setCommercial(e.target.checked)} /> Incluir o bloco “Para o Comercial”
            </label>
            {!commercialOk && <p className="-mt-2 text-xs text-tinta-suave">Preencha oferta, chamada (CTA), canal de conversão ou quem atende os leads na campanha para aparecer aqui.</p>}
            {link && <label className="flex items-center gap-2"><input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} /> Incluir link da campanha no sistema</label>}
          </div>
          <div className="mt-3">
            <div className="flex items-end justify-between gap-2">
              <Label>Texto (pode ajustar à vontade)</Label>
              {edited && <button type="button" onClick={() => { setEdited(false); setText(generated); }} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-nacao hover:underline"><RotateCcw className="size-3" /> Refazer texto</button>}
            </div>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} rows={16} className="w-full rounded-lg border border-borda p-2 font-mono text-[13px]" />
            <p className={cn('text-xs', text.length > 6000 ? 'text-erro' : 'text-tinta-suave')}>{text.length} caracteres{text.length > 6000 ? ' — longo demais para enviar pelo sistema; tire as tarefas feitas ou encurte.' : ''} · *negrito* e _itálico_ funcionam no WhatsApp.</p>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-navy">2. Compartilhe no grupo</h2>
          <p className="mt-1 text-sm text-tinta-suave">Abre o seu WhatsApp com o texto pronto — é só escolher o grupo do Marketing ou do Comercial.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><MessageCircle className="size-4" /> Abrir no WhatsApp</a>
            <Button variant="secondary" onClick={copy}>{copied ? <><Check /> Copiado!</> : <><Copy /> Copiar texto</>}</Button>
          </div>
        </Card>

        {canSend && (
          <Card className="p-4">
            <h2 className="font-bold text-navy">3. Ou envie pelo sistema</h2>
            <p className="mt-1 text-sm text-tinta-suave">Cada pessoa recebe no próprio WhatsApp, pode responder “OK” e o envio fica registrado em Comunicação Interna.</p>
            {!whatsapp.configured && <p className="mt-2 rounded-lg bg-fundo p-2 text-xs text-tinta-suave">WhatsApp não configurado: o briefing fica só no mural do app.</p>}
            {whatsapp.testMode && <p className="mt-2 rounded-lg bg-fundo p-2 text-xs text-tinta-suave">Modo teste ligado: no máximo 3 mensagens, todas para o número de teste.</p>}

            <div className="mt-3 space-y-3 text-sm">
              <div>
                <Label>Equipe da campanha</Label>
                {team.length === 0 ? <p className="text-xs text-tinta-suave">Ninguém ligado à campanha ainda (responsável, participantes ou tarefas).</p> : (
                  <ul className="space-y-1">
                    {team.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={userIds.includes(m.id)} onChange={() => { setUserIds(toggle(userIds, m.id)); setAudience(null); }} />
                          <span className="font-semibold text-navy">{m.name}</span>
                          <span className="text-xs text-tinta-suave">{m.why.join(', ')}{!m.hasPhone && ' · sem WhatsApp no cadastro'}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <Label>Perfis inteiros (ex.: Comercial, Recepção)</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <button key={r.key} type="button" onClick={() => { setRoleKeys(toggle(roleKeys, r.key)); setAudience(null); }}
                      className={cn('rounded-full border px-3 py-1 text-xs font-semibold', roleKeys.includes(r.key) ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave hover:border-nacao')}>{r.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Grupos ou números (um por linha)</Label>
                <textarea value={numbers} onChange={(e) => { setNumbers(e.target.value); setAudience(null); }} rows={2} className="w-full rounded-lg border border-borda p-2 text-sm" placeholder="120363000000000000-group" />
                <p className="text-xs text-tinta-suave">ID de grupo do WhatsApp (termina em -group) ou número com DDD. O número da Nação precisa estar no grupo.</p>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={askOk} onChange={(e) => setAskOk(e.target.checked)} /> Pedir “OK” de leitura</label>
            </div>

            {audience && (
              <p className="mt-3 rounded-lg bg-fundo p-2 text-sm">
                <b className="text-navy">{audience.comTelefone}</b> de {audience.total} recebem no WhatsApp{audience.teste ? ` (modo teste: só ${audience.teste})` : ''}.
                {audience.semTelefone.length > 0 && <span className="block text-xs text-tinta-suave">Sem WhatsApp no cadastro: {audience.semTelefone.slice(0, 12).join(', ')}{audience.semTelefone.length > 12 ? '…' : ''}.</span>}
              </p>
            )}
            <FormMessage error={msg.error} success={msg.ok} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={pending} onClick={checkAudience}><Eye /> Conferir quem recebe</Button>
              <Button disabled={pending || text.length > 6000} onClick={send}><Send /> {pending ? 'Enviando…' : 'Enviar briefing'}</Button>
            </div>
          </Card>
        )}
        {!canSend && <FormMessage error={msg.error} success={msg.ok} />}
      </div>

      <div className="min-w-0">
        <div className="sticky top-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Como chega no WhatsApp</p>
          <div className="rounded-xl bg-[#ECE5DD] p-3">
            <div className="ml-auto max-w-[95%] whitespace-pre-wrap break-words rounded-lg bg-[#DCF8C6] p-3 text-[13px] leading-relaxed text-[#111] shadow-sm">{waFormat(text)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** *negrito* e _itálico_ como o WhatsApp mostra. */
function waFormat(text: string) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((p, i) =>
    /^\*[^*\n]+\*$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b> : /^_[^_\n]+_$/.test(p) ? <i key={i}>{p.slice(1, -1)}</i> : p,
  );
}
