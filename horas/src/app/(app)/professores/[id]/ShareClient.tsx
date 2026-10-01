'use client';

import { useMemo, useState, useTransition } from 'react';
import { Copy, MessageCircle, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/alert';
import { Label } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { GUIDELINES_TEMPLATE, teacherGradeText, whatsappLink } from '@/domain/teacher-share';
import type { TeacherShareData } from '@/server/services/teacher-share-service';
import { saveGuidelinesAction } from './actions';

const AREA = 'w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm outline-none focus:border-nacao disabled:bg-fundo';

/** Compartilhar a grade do professor no WhatsApp, com as orientações (conduta, tarefas, rotina). */
export function ShareGrade({ teacherId, data, autoOpen = false }: { teacherId: string; data: TeacherShareData; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [general, setGeneral] = useState(data.general || (data.canEdit ? GUIDELINES_TEMPLATE : ''));
  const [specific, setSpecific] = useState(data.specific);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const text = useMemo(() => teacherGradeText({ ...data, general, specific }), [data, general, specific]);
  const [saved, setSaved] = useState({ general: data.general.trim(), specific: data.specific.trim() });
  const dirty = general.trim() !== saved.general || specific.trim() !== saved.specific;
  const first = data.name.split(' ')[0];

  const save = () => start(async () => {
    setMsg({});
    const r = await saveGuidelinesAction(teacherId, { general, specific });
    if (!r.ok) return setMsg({ error: r.error });
    setSaved({ general: general.trim(), specific: specific.trim() });
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
            <div>
              <Label htmlFor="sh-general">Orientações gerais (todos os professores)</Label>
              <textarea id="sh-general" rows={8} maxLength={4000} disabled={!data.canEdit} className={AREA} value={general} onChange={(e) => setGeneral(e.target.value)}
                placeholder="Conduta, tarefas e rotina que valem para toda a equipe." />
              {!saved.general && data.canEdit && <p className="mt-1 text-xs text-tinta-fraca">Sugestão inicial: ajuste e salve. Vale para todos os professores.</p>}
            </div>
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
