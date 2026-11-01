'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Clock, Download, ShieldCheck, XCircle } from 'lucide-react';
import { ContractText } from '@/components/contracts/ContractText';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { SignView } from '@/server/services/contract-service';
import { refuseAction, requestCodeAction, signAction } from './actions';

const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  ASSINADO: { label: 'Assinou', tone: 'green' },
  PENDENTE: { label: 'Pendente', tone: 'amber' },
  RECUSADO: { label: 'Recusou', tone: 'red' },
};

export function SignClient({ token, view }: { token: string; view: SignView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const canSign = view.status === 'AGUARDANDO' && view.me.status === 'PENDENTE';

  const run = <T,>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, after?: (d: T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { setMsg({ error: r.error }); return; }
      setMsg({ success: r.message });
      after?.(r.data);
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy">{view.title}</h1>
        <p className="mt-1 text-sm text-tinta-suave">Olá, {view.me.name}. Leia o contrato abaixo. Para assinar, você vai receber um código no seu WhatsApp ({view.me.phone}).</p>
      </div>

      <div className="rounded-2xl border border-borda bg-white p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Partes</p>
        <ul className="divide-y divide-borda">
          {view.signers.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><b className="text-tinta">{s.name}</b> <span className="text-tinta-suave">· {s.role}</span></span>
              <span className="flex items-center gap-2 text-xs text-tinta-suave">{s.signedAt}<Badge tone={STATUS[s.status]?.tone ?? 'amber'}>{STATUS[s.status]?.label ?? s.status}</Badge></span>
            </li>
          ))}
        </ul>
      </div>

      {view.status === 'ASSINADO' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sucesso/10 p-4 text-sucesso">
          <span className="flex items-center gap-2 font-semibold"><CircleCheck className="size-5" /> Contrato assinado por todas as partes.</span>
          <a href={`/assinar/${token}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm' })}><Download /> Baixar contrato assinado</a>
        </div>
      )}
      {view.status === 'AGUARDANDO' && view.me.status === 'ASSINADO' && (
        <div className="flex items-center gap-2 rounded-2xl bg-nacao/10 p-4 text-sm font-semibold text-nacao"><Clock className="size-5" /> Você já assinou em {view.me.signedAt}. Assim que todos assinarem, o contrato fica disponível para baixar neste mesmo link.</div>
      )}
      {view.me.status === 'RECUSADO' && (
        <div className="flex items-center gap-2 rounded-2xl bg-critico/10 p-4 text-sm font-semibold text-critico"><XCircle className="size-5" /> Você recusou este contrato. A Nação Club foi avisada.</div>
      )}

      <article className="rounded-2xl border border-borda bg-white p-5 sm:p-8">
        <ContractText text={view.body} />
        {view.bodyHash && <p className="mt-6 break-all border-t border-borda pt-3 font-mono text-[10px] text-tinta-fraca">SHA-256 do texto: {view.bodyHash}</p>}
      </article>

      <a href={`/assinar/${token}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Download /> {view.hasFinal ? 'Baixar PDF assinado' : 'Baixar PDF para ler'}</a>

      {canSign && (
        <div className="space-y-4 rounded-2xl border-2 border-nacao/30 bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-navy"><ShieldCheck className="size-5 text-nacao" /> Assinar eletronicamente</h2>
          <FormMessage error={msg.error} success={msg.success} />
          <div>
            <p className="text-sm text-tinta-suave">1. Receba o código de 6 dígitos no WhatsApp {view.me.phone}.</p>
            <Button className="mt-2" variant={codeSent ? 'secondary' : 'primary'} disabled={pending} onClick={() => run(() => requestCodeAction(token), () => setCodeSent(true))}>
              {codeSent ? 'Reenviar código' : 'Receber código no WhatsApp'}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="code">2. Código recebido</Label>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="font-mono tracking-[0.3em]" />
            </div>
            <div>
              <Label htmlFor="name">3. Seu nome completo</Label>
              <Input id="name" autoComplete="name" placeholder={view.me.name} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-tinta">
            <input type="checkbox" className="mt-1 size-4 accent-nacao" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>Li e concordo com todos os termos deste contrato e reconheço esta assinatura eletrônica como válida (MP 2.200-2/2001, art. 10, § 2º).</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || code.length !== 6 || name.trim().length < 3 || !agree} onClick={() => run(() => signAction(token, { code, name, agree }), () => router.refresh())}>
              Assinar contrato
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setRefusing((v) => !v)}>Não concordo / recusar</Button>
          </div>
          {refusing && (
            <div className="space-y-2 rounded-xl bg-fundo p-3">
              <Label htmlFor="reason">Por que você está recusando?</Label>
              <Input id="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: o valor está diferente do combinado" />
              <Button variant="danger" size="sm" disabled={pending || reason.trim().length < 3} onClick={() => { if (confirm('Confirmar a recusa? A Nação Club será avisada.')) run(() => refuseAction(token, reason), () => router.refresh()); }}>Confirmar recusa</Button>
            </div>
          )}
          <p className="text-xs text-tinta-fraca">Registramos data, hora, IP e dispositivo da assinatura como evidência. O código vale por 10 minutos.</p>
        </div>
      )}
    </div>
  );
}
