'use client';

import { useState, useTransition } from 'react';
import { Copy, MessageCircle, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { Label } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { guidelinesTemplate, teacherGradeText, whatsappLink } from '@/domain/teacher-share';
import type { TeacherShareData } from '@/server/services/teacher-share-service';
import { saveGuidelinesAction } from './actions';

const AREA = 'w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-nacao disabled:bg-fundo';

/** Compartilhar a grade do professor no WhatsApp, com as orientações (conduta, tarefas, rotina). */
export function ShareGrade({ teacherId, data, autoOpen = false }: { teacherId: string; data: TeacherShareData; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  // Mensagem geral por gênero (Musculação × Aulas Coletivas): sem texto ainda, começa com uma sugestão.
  const [areaText, setAreaText] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.groups.map((a) => [a.id, a.guidelines || (a.canEdit ? guidelinesTemplate(a.id) : '')])));
  const [specific, setSpecific] = useState(data.specific);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const groups = data.groups.map((a) => ({ ...a, guidelines: areaText[a.id] ?? '' }));
  const text = teacherGradeText({ ...data, groups, specific });
  const [saved, setSaved] = useState(() => ({ areas: Object.fromEntries(data.groups.map((a) => [a.id, a.guidelines.trim()])) as Record<string, string>, specific: data.specific.trim() }));
  const editable = data.groups.filter((a) => a.canEdit);
  const dirty = editable.some((a) => (areaText[a.id] ?? '').trim() !== saved.areas[a.id]) || specific.trim() !== saved.specific;
  const first = data.name.split(' ')[0];

  const save = () => start(async () => {
    setMsg({});
    const payload = Object.fromEntries(editable.map((a) => [a.id, areaText[a.id] ?? '']));
    const r = await saveGuidelinesAction(teacherId, { groups: payload, specific });
    if (!r.ok) return setMsg({ error: r.error });
    setSaved({ areas: { ...saved.areas, ...Object.fromEntries(editable.map((a) => [a.id, (areaText[a.id] ?? '').trim()])) }, specific: specific.trim() });
    setMsg({ ok: 'Orientações salvas: valem para os próximos compartilhamentos.' });
  });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><MessageCircle /> Compartilhar no WhatsApp</Button>
      {open && (
        <Sheet title={`Grade de ${first} no WhatsApp`} onClose={() => setOpen(false)} onSubmit={(e) => e.preventDefault()}
          footer={<>
            <a href={whatsappLink(data.phone, text)} target="_blank" rel="noopener"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-bold text-white hover:brightness-95">
              <Send className="size-4" /> {data.phone ? `Enviar para ${first}` : 'Abrir WhatsApp'}
            </a>
            <Button type="button" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(text); setMsg({ ok: 'Texto copiado. É só colar na conversa.' }); }}><Copy /> Copiar</Button>
          </>}>
          <div className="space-y-4">
            {!data.phone && <p className="rounded-lg bg-atencao/10 p-2 text-xs text-tinta">Sem telefone no cadastro: o WhatsApp abre para você escolher o contato.</p>}
            {data.groups.length === 0 && <p className="text-xs text-tinta-suave">Sem modalidade nem aula na grade: não há mensagem geral para este professor.</p>}
            {data.groups.map((a) => (
              <div key={a.id}>
                <Label htmlFor={`sh-area-${a.id}`}>Mensagem geral · {a.name} <span className="font-normal text-tinta-fraca">(todos os professores de {a.id === 'musculacao' ? 'Musculação' : 'Aulas Coletivas'})</span></Label>
                <textarea id={`sh-area-${a.id}`} rows={7} maxLength={4000} disabled={!a.canEdit} className={AREA} value={areaText[a.id] ?? ''}
                  onChange={(e) => setAreaText((x) => ({ ...x, [a.id]: e.target.value }))}
                  placeholder={`Conduta, tarefas e rotina dos professores de ${a.name}.`} />
                {(!saved.areas[a.id] && a.canEdit) || (!a.canEdit && data.canEdit) ? (
                  <p className="mt-1 text-xs text-tinta-fraca">{!a.canEdit ? 'Só a coordenação deste gênero edita.' : 'Sugestão inicial: ajuste e salve.'}</p>
                ) : null}
              </div>
            ))}
            <div>
              <Label htmlFor="sh-specific">Orientações para {first} (opcional)</Label>
              <textarea id="sh-specific" rows={3} maxLength={2000} disabled={!data.canEdit} className={AREA} value={specific} onChange={(e) => setSpecific(e.target.value)}
                placeholder="Ex.: responsável por abrir o box às 5h; conferir o estoque de giz às sextas." />
            </div>
            {data.canEdit && (
              <Button type="button" size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={pending || !dirty} onClick={save}>
                <Save /> {pending ? 'Salvando…' : dirty ? 'Salvar orientações' : 'Orientações salvas'}
              </Button>
            )}
            <FormMessage error={msg.error} success={msg.ok} />
            <div>
              <p className="mb-1 text-xs font-semibold text-tinta-suave">Prévia da mensagem</p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-[#E7FFDB] p-3 font-sans text-sm text-tinta">{text}</pre>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
