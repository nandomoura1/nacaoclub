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
  // Orientações por área (Musculação, Aulas Coletivas…): áreas ainda sem texto começam com uma sugestão.
  const [areaText, setAreaText] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.areas.map((a) => [a.id, a.guidelines || (a.canEdit ? guidelinesTemplate(a) : '')])));
  const [specific, setSpecific] = useState(data.specific);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const areas = data.areas.map((a) => ({ ...a, guidelines: areaText[a.id] ?? '' }));
  const text = teacherGradeText({ ...data, areas, specific });
  const [saved, setSaved] = useState(() => ({ areas: Object.fromEntries(data.areas.map((a) => [a.id, a.guidelines.trim()])) as Record<string, string>, specific: data.specific.trim() }));
  const editable = data.areas.filter((a) => a.canEdit);
  const dirty = editable.some((a) => (areaText[a.id] ?? '').trim() !== saved.areas[a.id]) || specific.trim() !== saved.specific;
  const first = data.name.split(' ')[0];

  const save = () => start(async () => {
    setMsg({});
    const payload = Object.fromEntries(editable.map((a) => [a.id, areaText[a.id] ?? '']));
    const r = await saveGuidelinesAction(teacherId, { areas: payload, specific });
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
            {data.areas.length === 0 && <p className="text-xs text-tinta-suave">Sem modalidade nem aula na grade: não há orientações de área para este professor.</p>}
            {data.areas.map((a) => (
              <div key={a.id}>
                <Label htmlFor={`sh-area-${a.id}`}>Orientações · {a.name} <span className="font-normal text-tinta-fraca">(todos os professores da área)</span></Label>
                <textarea id={`sh-area-${a.id}`} rows={7} maxLength={4000} disabled={!a.canEdit} className={AREA} value={areaText[a.id] ?? ''}
                  onChange={(e) => setAreaText((x) => ({ ...x, [a.id]: e.target.value }))}
                  placeholder={`Conduta, tarefas e rotina dos professores de ${a.name}.`} />
                <p className="mt-1 text-xs text-tinta-fraca">
                  {a.modalities.join(', ')}{!saved.areas[a.id] && a.canEdit ? ' · sugestão inicial: ajuste e salve.' : ''}{!a.canEdit && data.canEdit ? ' · só a coordenação desta área edita.' : ''}
                </p>
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
