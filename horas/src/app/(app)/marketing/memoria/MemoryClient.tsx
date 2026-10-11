'use client';

import { useRef, useState } from 'react';
import { Brain, FileText, History, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { KnowledgeRow } from '@/server/services/mkt-memory-service';
import { deleteKnowledgeAction, draftKnowledgeAction, saveKnowledgeAction } from '../actions';
import { useRun } from '../_components/useRun';

type Draft = { id: string | null; title: string; content: string; source: string | null; active: boolean };

export function MemoryClient({ rows, history, perms }: { rows: KnowledgeRow[]; history: string[]; perms: { admin: boolean; ai: boolean } }) {
  const { msg, setMsg, pending, run } = useRun();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const active = rows.filter((r) => r.active);
  const chars = active.reduce((s, r) => s + r.content.length, 0);

  const fromDoc = () => {
    const fd = new FormData();
    if (file) fd.set('file', file); else fd.set('text', text);
    setReading(true);
    run(() => draftKnowledgeAction(fd), (r) => { setReading(false); if (r.ok) { setEdit({ id: null, ...r.data, active: true }); setFile(null); setText(''); } });
  };

  return (
    <div className="space-y-4">
      <FormMessage error={msg.error} success={msg.ok} />
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-bold text-navy"><Brain className="size-4 text-nacao" /> Aprendizados ativos ({active.length})</h2>
          <p className="text-xs text-tinta-suave">{chars.toLocaleString('pt-BR')} caracteres de contexto (a IA lê até 12 mil — os mais recentes primeiro).</p>
          {rows.length === 0 && <p className="mt-3 text-sm text-tinta-suave">Nenhum aprendizado ainda. Comece pelos documentos de marketing: cronograma, estrutura da equipe, relatórios de parceiros.</p>}
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className={cn('rounded-xl border p-3', r.active ? 'border-borda' : 'border-dashed border-borda opacity-60')}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-semibold text-navy">{r.title}</p>
                  {!r.active && <span className="rounded bg-fundo px-1.5 text-[10px] font-semibold text-tinta-suave">inativa</span>}
                  {perms.admin && (
                    <>
                      <button type="button" aria-label="Editar" className="text-tinta-fraca hover:text-nacao" onClick={() => { setMsg({}); setEdit({ id: r.id, title: r.title, content: r.content, source: r.source, active: r.active }); }}><Pencil className="size-4" /></button>
                      <button type="button" aria-label="Excluir" className="text-tinta-fraca hover:text-critico" disabled={pending} onClick={() => confirm(`Excluir "${r.title}"?`) && run(() => deleteKnowledgeAction(r.id))}><Trash2 className="size-4" /></button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-tinta-fraca">{r.source ?? 'manual'} · atualizada em {new Date(r.updatedAt).toLocaleDateString('pt-BR')}</p>
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-tinta">{r.content}</p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          {perms.admin && (
            <Card className="space-y-2 p-4">
              <h2 className="flex items-center gap-2 font-bold text-navy"><Sparkles className="size-4 text-nacao" /> Ensinar a partir de um documento</h2>
              <p className="text-xs text-tinta-suave">Google Docs → Arquivo → Fazer download → .docx (ou cole o texto). A IA propõe os aprendizados; você revisa e salva.</p>
              <button type="button" onClick={() => ref.current?.click()} className={cn('flex w-full items-center gap-2 rounded-xl border-2 border-dashed p-3 text-left text-sm', file ? 'border-nacao bg-nacao/5' : 'border-borda hover:border-nacao/50')}>
                <FileText className="size-5 shrink-0 text-nacao" /><span className="min-w-0 flex-1 truncate">{file ? file.name : 'Escolher arquivo'}</span>
              </button>
              <input ref={ref} type="file" accept=".docx,.pdf,.txt,.md,.html" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              {!file && <textarea className="min-h-24 w-full rounded-lg border border-borda p-2 text-sm" placeholder="…ou cole o texto" value={text} onChange={(e) => setText(e.target.value)} />}
              <Button size="sm" disabled={pending || !perms.ai || (!file && text.trim().length < 40)} onClick={fromDoc}><Sparkles /> {reading && pending ? 'Lendo o documento…' : 'Gerar aprendizados (IA)'}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEdit({ id: null, title: '', content: '', source: null, active: true })}><Plus /> Escrever à mão</Button>
            </Card>
          )}
          <Card className="p-4">
            <h2 className="flex items-center gap-2 font-bold text-navy"><History className="size-4 text-nacao" /> Mesmo período do ano passado</h2>
            <p className="text-xs text-tinta-suave">O que a IA vê como referência para as próximas semanas.</p>
            {history.length === 0 ? <p className="mt-2 text-sm text-tinta-suave">Sem histórico ainda — importe o cronograma do ano.</p> : (
              <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto text-xs">{history.map((h, i) => <li key={i} className="truncate" title={h}>{h.replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3/$2/$1')}</li>)}</ul>
            )}
          </Card>
        </div>
      </div>

      {edit && (
        <Card className="space-y-3 border-nacao/30 p-4">
          <h2 className="font-bold text-navy">{edit.id ? 'Editar aprendizado' : 'Novo aprendizado'}{edit.source && !edit.id ? <span className="ml-2 text-xs font-normal text-tinta-suave">rascunho da IA a partir de {edit.source} — revise antes de salvar</span> : null}</h2>
          <div><Label>Título</Label><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="ex.: Calendário recorrente da Nação" /></div>
          <div><Label>Aprendizados</Label><textarea className="min-h-72 w-full rounded-lg border border-borda p-2 font-mono text-[13px]" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativa (a IA usa)</label>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(() => saveKnowledgeAction(edit.id, { title: edit.title, content: edit.content, source: edit.source, active: edit.active }), (r) => { if (r.ok) setEdit(null); })}>Salvar</Button>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
