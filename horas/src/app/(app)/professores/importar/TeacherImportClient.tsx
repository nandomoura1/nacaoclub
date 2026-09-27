'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { analyzeTeachersAction, commitTeachersAction } from './actions';

type Analysis = Extract<Awaited<ReturnType<typeof analyzeTeachersAction>>, { ok: true }>['data'];
type Committed = Extract<Awaited<ReturnType<typeof commitTeachersAction>>, { ok: true }>['data'];

const ACTION: Record<string, { label: string; tone: 'green' | 'blue' | 'neutral' | 'red' }> = {
  create: { label: 'novo', tone: 'green' },
  update: { label: 'atualiza', tone: 'blue' },
  same: { label: 'sem mudança', tone: 'neutral' },
  skip: { label: 'ignorado', tone: 'red' },
};

export function TeacherImportClient() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [done, setDone] = useState<Committed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="size-10 text-sucesso" />
        <h2 className="text-xl font-extrabold text-navy">Cadastro atualizado</h2>
        <p className="text-sm text-tinta-suave">
          {done.created} novo(s) · {done.updated} atualizado(s){done.unchanged ? ` · ${done.unchanged} sem mudança` : ''}{done.skipped ? ` · ${done.skipped} ignorado(s)` : ''}.
        </p>
        <Link href="/professores" className={buttonVariants()}>Ver professores</Link>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card className="p-6">
          <h2 className="text-base font-extrabold text-navy">1. Baixe a planilha</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Uma pessoa por linha, com listas de cargo, contrato e modalidades. O <b>espelho</b> já vem com o cadastro atual: complete o que falta e envie
            de volta. <b>Célula vazia não apaga nada.</b>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/professores/modelo?espelho=1" download className={buttonVariants()}><Download /> Espelho do cadastro</a>
            <a href="/professores/modelo" download className={buttonVariants({ variant: 'secondary' })}><Download /> Modelo em branco</a>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-base font-extrabold text-navy">2. Envie a planilha preenchida</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              start(async () => {
                const r = await analyzeTeachersAction(fd);
                if (!r.ok) return setError(r.error);
                setAnalysis(r.data);
              });
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 rounded-lg bg-fundo p-4 text-sm text-tinta-suave">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-nacao" />
              <p>Não coloque CPF, dados bancários ou salário: o sistema não guarda esses dados e a planilha não tem colunas para eles.</p>
            </div>
            <div>
              <Label htmlFor="file">Arquivo .xlsx</Label>
              <Input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="pt-2" />
            </div>
            <FormMessage error={error} />
            <Button type="submit" disabled={pending}><Upload /> {pending ? 'Lendo a planilha…' : 'Ler e mostrar prévia'}</Button>
          </form>
        </Card>
      </div>
    );
  }

  const count = (a: string) => analysis.plan.filter((p) => p.action === a).length;
  const willChange = count('create') + count('update');
  const visible = analysis.plan.filter((p) => showSame || p.action !== 'same');

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <FileSpreadsheet className="size-5 text-nacao" />
        <span className="font-bold text-tinta">{analysis.fileName}</span>
        <span className="text-sm text-tinta-suave">aba {analysis.sheet}</span>
        <div className="flex-1" />
        <Badge tone="green">{count('create')} novo(s)</Badge>
        <Badge tone="blue">{count('update')} atualiza(m)</Badge>
        <Badge tone="neutral">{count('same')} sem mudança</Badge>
        {count('skip') > 0 && <Badge tone="red">{count('skip')} ignorado(s)</Badge>}
      </Card>

      {analysis.warnings.length > 0 && (
        <Card className="border-atencao/40 p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-bold text-atencao"><TriangleAlert className="size-4" /> Linhas não lidas</p>
          <ul className="list-disc pl-5 text-tinta-suave">{analysis.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Card>
      )}

      <Card className="divide-y divide-borda">
        {visible.map((p) => (
          <div key={p.line} className={cn('flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-4', p.action === 'skip' && 'bg-critico/5')}>
            <div className="flex min-w-0 items-center gap-2 sm:w-72">
              <span className="w-10 shrink-0 text-xs text-tinta-fraca">L{p.line}</span>
              <span className="truncate font-semibold text-tinta">{p.name}</span>
              <Badge tone={ACTION[p.action]!.tone}>{ACTION[p.action]!.label}</Badge>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              {p.changes.map((c) => <p key={c} className="text-tinta-suave">{c}</p>)}
              {p.warnings.map((w) => <p key={w} className="text-atencao">⚠ {w}</p>)}
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="p-6 text-center text-sm text-tinta-suave">Nada muda: a planilha é igual ao cadastro.</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" className="accent-[#0169E9]" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />
          Mostrar quem não muda
        </label>
        <div className="flex-1" />
        <FormMessage error={error} />
        <Button variant="secondary" onClick={() => { setAnalysis(null); setError(null); }} disabled={pending}>Trocar arquivo</Button>
        <Button
          disabled={pending || willChange === 0}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await commitTeachersAction({ fileName: analysis.fileName, rows: analysis.rows });
              if (!r.ok) return setError(r.error);
              setDone(r.data);
            });
          }}
        >
          {pending ? 'Gravando…' : `Confirmar ${willChange} alteração(ões)`}
        </Button>
      </div>
    </div>
  );
}
