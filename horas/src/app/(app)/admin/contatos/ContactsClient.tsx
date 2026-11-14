'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, FileUp, MessageCircle, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { CONTACT_GROUPS, contactsText, formatPhone, waNumber, type ContactDraft } from '@/domain/contacts';
import type { ContactsPage } from '@/server/services/contacts-service';
import { importContactsAction, previewImportAction, saveContactAction, setContactActiveAction } from './actions';

type Contact = ContactsPage['contacts'][number];
type Msg = { ok?: string; error?: string } | null;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function PhoneLinks({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-tinta-fraca">sem telefone</span>;
  const wa = waNumber(phone);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-tinta hover:text-nacao">{formatPhone(phone)}</a>
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" title="Abrir no WhatsApp" className="text-sucesso hover:opacity-80">
          <MessageCircle className="size-4" />
        </a>
      )}
      <button type="button" title="Copiar número" onClick={() => navigator.clipboard?.writeText(formatPhone(phone))} className="text-tinta-fraca hover:text-tinta">
        <Copy className="size-3.5" />
      </button>
    </span>
  );
}

function Grouped<T extends { group: string }>({ items, render }: { items: T[]; render: (i: T) => React.ReactNode }) {
  const groups = new Map<string, T[]>();
  for (const i of items) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  return (
    <div className="space-y-4">
      {[...groups].map(([g, list]) => (
        <Card key={g} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-borda bg-fundo px-4 py-2">
            <h3 className="text-sm font-extrabold text-navy">{g}</h3>
            <span className="text-xs text-tinta-suave">{list.length}</span>
          </div>
          <ul className="divide-y divide-borda">{list.map(render)}</ul>
        </Card>
      ))}
    </div>
  );
}

export function ContactsClient({ data, showInactive }: { data: ContactsPage; showInactive: boolean }) {
  const [tab, setTab] = useState<'agenda' | 'equipe'>('agenda');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const match = (s: (string | null | undefined)[]) => !q.trim() || norm(s.filter(Boolean).join(' ')).includes(norm(q.trim())) || (q.replace(/\D/g, '').length >= 3 && s.join(' ').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
  const contacts = useMemo(() => data.contacts.filter((c) => match([c.name, c.group, c.company, c.note, c.phone, c.phone2])), [data.contacts, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = useMemo(() => (data.team ?? []).filter((t) => match([t.name, t.group, t.role, t.phone])), [data.team, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => [...new Set([...CONTACT_GROUPS, ...data.contacts.map((c) => c.group)])], [data.contacts]);
  const noPhone = (data.team ?? []).filter((t) => !t.phone).length;

  const copyList = () => {
    const text = tab === 'agenda'
      ? contactsText(contacts.filter((c) => c.active), 'Contatos importantes — Nação Club')
      : contactsText(team.map((t) => ({ name: t.name, group: t.group, phone: t.phone, note: t.role })), 'Equipe — Nação Club');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-borda bg-white p-1">
          {(['agenda', ...(data.canSeeTeam ? ['equipe'] : [])] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t as 'agenda' | 'equipe')}
              className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', tab === t ? 'bg-nacao text-white' : 'text-tinta-suave hover:text-tinta')}>
              {t === 'agenda' ? `Agenda (${data.contacts.filter((c) => c.active).length})` : `Equipe (${data.team?.length ?? 0})`}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-fraca" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, grupo ou número" className="pl-9" />
        </div>
        <Button variant="secondary" size="sm" onClick={copyList}><Copy /> {copied ? 'Copiado!' : 'Copiar lista'}</Button>
        {tab === 'agenda' && data.canEdit && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setImporting(true)}><FileUp /> Importar</Button>
            <Button size="sm" onClick={() => setEditing({ group: groups[0] })}><Plus /> Novo contato</Button>
          </>
        )}
      </div>

      {tab === 'agenda' ? (
        <>
          {data.canEdit && (
            <p className="text-xs text-tinta-suave">
              <Link href={showInactive ? '/admin/contatos' : '/admin/contatos?inativos=1'} className="text-nacao hover:underline">
                {showInactive ? 'Esconder desativados' : 'Mostrar desativados'}
              </Link>
            </p>
          )}
          {contacts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-tinta-suave">
              {data.contacts.length === 0 ? 'Agenda vazia. Cadastre ou importe os contatos (cole da planilha).' : 'Nada encontrado.'}
            </Card>
          ) : (
            <Grouped items={contacts} render={(c) => (
              <li key={c.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm', !c.active && 'opacity-50')}>
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold text-tinta">{c.name}{!c.active && <Badge className="ml-2">desativado</Badge>}</p>
                  {(c.company || c.note) && <p className="text-xs text-tinta-suave">{[c.company, c.note].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <PhoneLinks phone={c.phone} />
                  {c.phone2 && <PhoneLinks phone={c.phone2} />}
                </div>
                {data.canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)} title="Editar"><Pencil /></Button>
                )}
              </li>
            )} />
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-tinta-suave">
            Direto do cadastro de colaboradores ativos. {noPhone > 0 && <><b>{noPhone}</b> sem telefone — clique no nome para completar na ficha.</>}
          </p>
          <Grouped items={team} render={(t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <div className="min-w-[180px] flex-1">
                <Link href={`/professores/${t.id}`} className="font-semibold text-tinta hover:text-nacao">{t.name}</Link>
                {t.role && <p className="text-xs text-tinta-suave">{t.role}</p>}
              </div>
              {t.phone ? <PhoneLinks phone={t.phone} /> : <Badge tone="amber">sem telefone</Badge>}
            </li>
          )} />
        </>
      )}

      {editing && <ContactSheet contact={editing} groups={groups} onClose={() => setEditing(null)} />}
      {importing && <ImportSheet groups={groups} onClose={() => setImporting(false)} />}
    </div>
  );
}

function ContactSheet({ contact, groups, onClose }: { contact: Partial<Contact>; groups: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState({
    name: contact.name ?? '', groupName: contact.group ?? '', company: contact.company ?? '',
    phone: contact.phone ?? '', phone2: contact.phone2 ?? '', note: contact.note ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet
      title={contact.id ? 'Editar contato' : 'Novo contato'}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveContactAction({ ...f, id: contact.id });
          if (!r.ok) return setMsg({ error: r.error });
          router.refresh();
          onClose();
        });
      }}
      footer={
        <>
          <Button type="submit" disabled={pending}>Salvar</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          {contact.id && (
            <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => start(async () => {
              const r = await setContactActiveAction(contact.id!, !contact.active);
              if (!r.ok) return setMsg({ error: r.error });
              router.refresh();
              onClose();
            })}>{contact.active ? 'Desativar' : 'Reativar'}</Button>
          )}
        </>
      }
    >
      <div><Label>Nome</Label><Input value={f.name} onChange={set('name')} required autoFocus /></div>
      <div>
        <Label>Grupo</Label>
        <Input value={f.groupName} onChange={set('groupName')} list="contact-groups" required />
        <datalist id="contact-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <div><Label>Empresa / serviço</Label><Input value={f.company} onChange={set('company')} placeholder="Ex.: Studio Pilates" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Telefone</Label><Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="(61) 90000-0000" /></div>
        <div><Label>Telefone 2</Label><Input value={f.phone2} onChange={set('phone2')} inputMode="tel" /></div>
      </div>
      <div><Label>Observação</Label><Input value={f.note} onChange={set('note')} placeholder="Ex.: responsável, horário" /></div>
      <FormMessage error={msg?.error} />
    </Sheet>
  );
}

type PreviewRow = ContactDraft & { status: 'novo' | 'existe' | 'equipe'; pick: boolean };

function ImportSheet({ groups, onClose }: { groups: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [text, setText] = useState('');
  const [group, setGroup] = useState('Serviços terceirizados');
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const picked = rows?.filter((r) => r.pick) ?? [];
  return (
    <Sheet
      title="Importar contatos"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (!rows) {
            const r = await previewImportAction(text, group);
            if (!r.ok) return setMsg({ error: r.error });
            setSkipped(r.data.skipped);
            return setRows(r.data.rows.map((x) => ({ ...x, pick: x.status === 'novo' })));
          }
          const r = await importContactsAction(picked.map(({ status: _s, pick: _p, ...d }) => d));
          if (!r.ok) return setMsg({ error: r.error });
          router.refresh();
          onClose();
        });
      }}
      footer={
        <>
          <Button type="submit" disabled={pending || (!rows && !text.trim()) || (!!rows && picked.length === 0)}>
            {rows ? `Importar ${picked.length}` : 'Ver prévia'}
          </Button>
          {rows && <Button type="button" variant="ghost" onClick={() => setRows(null)}>Voltar</Button>}
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </>
      }
    >
      {!rows ? (
        <>
          <p className="text-sm text-tinta-suave">
            Cole as linhas da planilha. Uma por contato: <b>Nome</b> e <b>telefone</b> (ou colunas Nome · Telefone · Grupo · Empresa · Observação).
            Uma linha só com texto (ex.: &quot;KIDS&quot;) vira o grupo das seguintes.
          </p>
          <div>
            <Label>Grupo padrão</Label>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} list="contact-groups-imp" />
            <datalist id="contact-groups-imp">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div>
            <Label>Linhas</Label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12}
              className="w-full rounded-lg border border-borda p-3 font-mono text-xs focus:border-nacao focus:outline-none" />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-tinta-suave">Marque o que entra. Quem já está na agenda ou na equipe (mesmo nome/telefone) vem desmarcado.</p>
          <ul className="divide-y divide-borda rounded-lg border border-borda text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-2 px-3 py-2">
                <input type="checkbox" checked={r.pick} className="mt-1"
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: e.target.checked } : x)))} />
                <div className="flex-1">
                  <p className="font-semibold">{r.name} {r.status !== 'novo' && <Badge tone="amber">{r.status === 'existe' ? 'já na agenda' : 'é da equipe'}</Badge>}</p>
                  <p className="text-xs text-tinta-suave">{r.groupName} · {[r.phone, r.phone2].filter(Boolean).map((p) => formatPhone(p)).join(' / ') || 'sem telefone'}</p>
                </div>
              </li>
            ))}
          </ul>
          {skipped.length > 0 && <p className="text-xs text-tinta-suave">Ignoradas ({skipped.length}): {skipped.slice(0, 5).join(' · ')}</p>}
        </>
      )}
      <FormMessage error={msg?.error} />
    </Sheet>
  );
}
