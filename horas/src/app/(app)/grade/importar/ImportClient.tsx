'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { formatMinutes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { buildPlan, nameKey, weeklyByPerson, type NameDecision, type NameDecisions, type ModalityOverrides } from '@/domain/import/plan';
import { analyzeAction, commitAction } from './actions';

type Analysis = Extract<Awaited<ReturnType<typeof analyzeAction>>, { ok: true }>['data'];
type Committed = Extract<Awaited<ReturnType<typeof commitAction>>, { ok: true }>['data'];

const LAYOUT_LABEL: Record<string, string> = { SALA: 'grade por sala', QUADRA: 'quadras (turma - professor)', PLANTAO: 'plantão por faixa' };

export function ImportClient({ today }: { today: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [done, setDone] = useState<Committed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="size-10 text-sucesso" />
        <h2 className="text-xl font-extrabold text-navy">{done.created} aulas importadas</h2>
        <p className="text-sm text-tinta-suave">
          {done.newTeachers} professor(es) cadastrado(s){done.skipped ? ` · ${done.skipped} já existiam e foram mantidas` : ''}{done.ignoredRows ? ` · ${done.ignoredRows} célula(s) ignorada(s)` : ''}.
        </p>
        <div className="flex gap-2">
          <Link href="/grade" className={buttonVariants()}>Ver a grade</Link>
          <Link href="/professores" className={buttonVariants({ variant: 'secondary' })}>Completar cadastro dos professores</Link>
        </div>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="max-w-2xl p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            start(async () => {
              const r = await analyzeAction(fd);
              if (!r.ok) return setError(r.error);
              setAnalysis(r.data);
            });
          }}
          className="space-y-4"
        >
          <div className="flex items-start gap-3 rounded-lg bg-fundo p-4 text-sm text-tinta-suave">
            <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-nacao" />
            <p>
              No Google Sheets: <b>Arquivo → Fazer download → Microsoft Excel (.xlsx)</b>. Pode enviar a planilha inteira: abas que não são grade
              (folha, salários, contatos) são ignoradas automaticamente e <b>não são lidas</b> para nada além de reconhecer o formato.
            </p>
          </div>
          <div>
            <Label htmlFor="file">Arquivo .xlsx</Label>
            <Input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="pt-2" />
          </div>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}><Upload /> {pending ? 'Lendo a planilha…' : 'Ler e mostrar prévia'}</Button>
        </form>
      </Card>
    );
  }

  return <Preview analysis={analysis} today={today} onDone={setDone} onRestart={() => setAnalysis(null)} />;
}

function Preview({ analysis, today, onDone, onRestart }: { analysis: Analysis; today: string; onDone: (c: Committed) => void; onRestart: () => void }) {
  const recognized = analysis.sheets.filter((s) => s.layout && s.rows > 0);
  const [sheets, setSheets] = useState(() => recognized.map((s) => s.sheet));
  const [validFrom, setValidFrom] = useState(today);
  const [overrides, setOverrides] = useState<ModalityOverrides>({});
  const [decisions, setDecisions] = useState<NameDecisions>(() => Object.fromEntries(analysis.names.map((n) => [n.key, n.auto])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { catalog } = analysis;
  const teacherName = useMemo(() => new Map(catalog.teachers.map((t) => [t.id, t.displayName || t.name])), [catalog.teachers]);
  const rows = useMemo(() => analysis.rows.filter((r) => sheets.includes(r.sheet)), [analysis.rows, sheets]);
  const hints = analysis.hints.filter((h) => sheets.includes(h.sheet));
  const names = useMemo(() => {
    const used = new Set(rows.flatMap((r) => r.people.map((p) => nameKey(p.raw))));
    return analysis.names.filter((n) => used.has(n.key));
  }, [analysis.names, rows]);

  const plan = useMemo(() => buildPlan(rows, catalog, overrides, decisions), [rows, catalog, overrides, decisions]);
  const weekly = useMemo(() => weeklyByPerson(plan.slots, (id) => catalog.countsHours[id] ?? true), [plan.slots, catalog.countsHours]);
  const unresolved = new Set(plan.unresolvedKeys);

  const personLabel = (ref: string) => {
    if (!ref.startsWith('new:')) return teacherName.get(ref) ?? '?';
    const d = decisions[ref.slice(4)];
    return d?.action === 'create' ? d.name : ref.slice(4);
  };
  const weeklyRows = [...weekly.entries()].map(([ref, v]) => ({ ref, name: personLabel(ref), isNew: ref.startsWith('new:'), ...v })).sort((a, b) => a.name.localeCompare(b.name));

  const commit = () => {
    setError(null);
    start(async () => {
      const r = await commitAction({ fileName: analysis.fileName, sheets, validFrom, rows, overrides, decisions });
      if (!r.ok) return setError(r.error);
      onDone(r.data);
    });
  };

  const newCount = names.filter((n) => decisions[n.key]?.action === 'create').length;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold text-navy">1. Abas encontradas em {analysis.fileName}</h2>
          <Button variant="ghost" size="sm" onClick={onRestart}>Trocar arquivo</Button>
        </div>
        <div className="space-y-2">
          {analysis.sheets.map((s) => (
            <label key={s.sheet} className={cn('flex items-start gap-3 rounded-lg border p-3', s.layout ? 'border-borda' : 'border-dashed border-borda opacity-60')}>
              <input type="checkbox" className="mt-1 accent-[#0169E9]" disabled={!s.layout || !s.rows}
                checked={sheets.includes(s.sheet)}
                onChange={(e) => setSheets(e.target.checked ? [...sheets, s.sheet] : sheets.filter((x) => x !== s.sheet))} />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{s.sheet}</span>
                <span className="block text-xs text-tinta-suave">
                  {s.layout ? `${LAYOUT_LABEL[s.layout]} · ${s.rows} células com aula` : 'não é uma grade: ignorada'}
                </span>
                {s.warnings.map((w) => <span key={w} className="mt-1 block text-xs text-atencao">⚠ {w}</span>)}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <Label htmlFor="vf">A grade importada vale a partir de</Label>
          <Input id="vf" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-extrabold text-navy">2. Modalidades</h2>
        <p className="mb-3 text-sm text-tinta-suave">O que o sistema reconheceu em cada texto da planilha. Ajuste o que estiver errado; os em vermelho precisam de uma decisão.</p>
        <div className="divide-y divide-borda rounded-lg border border-borda">
          {hints.map((h) => {
            const value = overrides[h.key] ?? h.auto?.modalityId ?? '';
            const bad = unresolved.has(h.key);
            return (
              <div key={h.key} className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', bad && 'bg-critico/5')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">“{h.text}” {h.auto?.label && <span className="font-normal text-tinta-suave">→ turma {h.auto.label}</span>}</p>
                  <p className="text-xs text-tinta-fraca">{h.sheet} · {h.count} célula(s)</p>
                </div>
                <Select className="sm:w-60" value={value} aria-label={`Modalidade para ${h.text}`}
                  onChange={(e) => setOverrides({ ...overrides, [h.key]: e.target.value })}>
                  <option value="" disabled>Escolha a modalidade…</option>
                  {catalog.modalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  <option value="ignore">— ignorar estas células —</option>
                </Select>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-extrabold text-navy">3. Pessoas ({names.length})</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Quem já existe é vinculado; quem não existe é cadastrado ({newCount} novo(s)). Nomes com erro de digitação: escolha &quot;é a mesma pessoa que…&quot;.
          O jeito que o nome aparece na planilha vira apelido — na próxima importação, o reconhecimento é automático.
        </p>
        <div className="divide-y divide-borda rounded-lg border border-borda">
          {names.map((n) => (
            <NameRow key={n.key} info={n} decision={decisions[n.key]!} teachers={catalog.teachers} others={names.filter((o) => o.key !== n.key && decisions[o.key]?.action === 'create')}
              onChange={(d) => setDecisions({ ...decisions, [n.key]: d })} />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-extrabold text-navy">4. Conferência: horas por semana</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Compare com a coluna <b>&quot;Horas total&quot; do quadro PADRÃO</b> da aba HORAS MENSAIS. Diferenças esperadas: correções manuais (&quot;-1&quot;) e nomes digitados errado
          que a planilha não contava. Personal não conta hora.
        </p>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {weeklyRows.map((w) => (
            <div key={w.ref} className="flex items-center justify-between border-b border-borda py-1.5 text-sm">
              <span className="truncate">{w.name} {w.isNew && <Badge tone="blue">novo</Badge>}</span>
              <span className="tabular font-semibold text-navy">{w.count} · {formatMinutes(w.minutes)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="sticky bottom-20 flex flex-col gap-3 border-nacao/30 p-4 shadow-lg sm:flex-row sm:items-center lg:bottom-4">
        <div className="flex-1 text-sm">
          <b className="text-navy">{plan.slots.length} aulas</b> serão criadas na grade
          {plan.ignoredRows > 0 && <span className="text-tinta-suave"> · {plan.ignoredRows} célula(s) ignorada(s)</span>}
          {unresolved.size > 0 && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-critico"><TriangleAlert className="size-4" /> {unresolved.size} texto(s) sem modalidade</span>}
        </div>
        <FormMessage error={error} />
        <Button onClick={commit} disabled={pending || unresolved.size > 0 || sheets.length === 0} size="lg">
          {pending ? 'Gravando…' : 'Confirmar importação'}
        </Button>
      </Card>
    </div>
  );
}

function NameRow({ info, decision, teachers, others, onChange }: {
  info: Analysis['names'][number];
  decision: NameDecision;
  teachers: Analysis['catalog']['teachers'];
  others: Analysis['names'];
  onChange: (d: NameDecision) => void;
}) {
  const value = decision.action === 'link' ? `link:${decision.teacherId}` : decision.action === 'same' ? `same:${decision.key}` : decision.action;
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56">
        <p className="truncate text-sm font-semibold">{info.examples.join(' · ')}</p>
        <p className="text-xs text-tinta-fraca">{info.count} célula(s)</p>
      </div>
      <Select className="sm:w-72" value={value} aria-label={`Decisão para ${info.examples[0]}`}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'create') onChange({ action: 'create', name: info.auto.action === 'create' ? info.auto.name : info.examples[0]! });
          else if (v === 'ignore') onChange({ action: 'ignore' });
          else if (v.startsWith('link:')) onChange({ action: 'link', teacherId: v.slice(5) });
          else if (v.startsWith('same:')) onChange({ action: 'same', key: v.slice(5) });
        }}>
        <option value="create">Cadastrar como professor novo</option>
        <option value="ignore">Ignorar (não é uma pessoa)</option>
        {others.length > 0 && (
          <optgroup label="É a mesma pessoa que (novo)…">
            {others.map((o) => <option key={o.key} value={`same:${o.key}`}>{o.examples[0]}</option>)}
          </optgroup>
        )}
        {teachers.length > 0 && (
          <optgroup label="Professor já cadastrado">
            {teachers.map((t) => <option key={t.id} value={`link:${t.id}`}>{t.displayName ? `${t.displayName} (${t.name})` : t.name}</option>)}
          </optgroup>
        )}
      </Select>
      {decision.action === 'create' && (
        <Input className="sm:flex-1" aria-label="Nome do novo professor" value={decision.name} onChange={(e) => onChange({ action: 'create', name: e.target.value })} />
      )}
    </div>
  );
}
