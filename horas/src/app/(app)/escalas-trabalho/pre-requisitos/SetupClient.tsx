'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatClock, parseClock, WEEKDAYS } from '@/domain/dates';
import { POST_KIND_LABEL, hhmm } from '@/domain/escalas/labels';
import type { HoursMap } from '@/domain/escalas/types';
import { cn } from '@/lib/cn';
import { deletePostAction, deleteRuleAction, savePostAction, saveRuleAction, saveSectorAction, saveSectorHoursAction } from '../actions';
import { HoursMapEditor, WeekdayPicker } from '../shared';

type PostRow = { id: string; name: string; kind: string | null; startMin: number; endMin: number; weekdays: number[]; minPeople: number; functionName: string | null; mandatory: boolean; sortOrder: number; active: boolean };
type RuleRow = { id: string; kind: string; label: string; params: Record<string, unknown>; mandatory: boolean; active: boolean; description: string };
type Opt = { id: string; name: string };
type SectorRow = { id: string; name: string; procSectorId: string | null; active: boolean; sortOrder: number; hours: HoursMap; cycleRef: string; notes: string | null; procSector: string | null };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) setError(r.error ?? 'Erro.'); else { setError(null); after?.(); router.refresh(); }
  });
  return { pending, error, run };
}

/** Diretoria/DP: criar setor, renomear, ligar ao setor da Gestão de Processos (o líder dele monta a escala). */
export function SectorAdmin({ sectors, procSectors }: { sectors: SectorRow[]; procSectors: Opt[] }) {
  const [open, setOpen] = useState<SectorRow | 'new' | null>(null);
  return (
    <Card className="mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold text-navy">Setores com escala</h2>
        <Button size="sm" onClick={() => setOpen('new')}><Plus /> Novo setor</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sectors.map((s) => (
          <button key={s.id} type="button" onClick={() => setOpen(s)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', s.active ? 'border-borda text-navy hover:border-nacao' : 'border-dashed border-borda text-tinta-fraca')}>
            {s.name}{s.procSector ? ` · líder: setor ${s.procSector}` : ' · sem líder'}
          </button>
        ))}
        {!sectors.length && <p className="text-sm text-tinta-suave">Nenhum ainda.</p>}
      </div>
      {open && <SectorSheet sector={open === 'new' ? null : open} procSectors={procSectors} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function SectorSheet({ sector, procSectors, onClose }: { sector: SectorRow | null; procSectors: Opt[]; onClose: () => void }) {
  const { pending, error, run } = useAct();
  const [v, setV] = useState({ name: sector?.name ?? '', procSectorId: sector?.procSectorId ?? '', active: sector?.active ?? true, sortOrder: sector?.sortOrder ?? 0, cycleRef: sector?.cycleRef ?? '' });
  return (
    <Sheet title={sector ? `Setor ${sector.name}` : 'Novo setor de escala'} onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); run(() => saveSectorAction(sector?.id ?? null, { name: v.name, procSectorId: v.procSectorId || null, hours: sector?.hours ?? {}, cycleRef: v.cycleRef, notes: sector?.notes ?? null, sortOrder: v.sortOrder, active: v.active }), onClose); }}
      footer={<><Button type="submit" disabled={pending}>Salvar</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <div><Label htmlFor="s-n">Nome</Label><Input id="s-n" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Cozinha" /></div>
      <div>
        <Label htmlFor="s-p">Setor da Gestão de Processos (o líder dele monta esta escala)</Label>
        <Select id="s-p" value={v.procSectorId} onChange={(e) => setV({ ...v, procSectorId: e.target.value })}><option value="">— sem líder (só a gestão) —</option>{procSectors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </div>
      <div><Label htmlFor="s-c">Início de uma semana A (ciclo A/B)</Label><Input id="s-c" type="date" value={v.cycleRef} onChange={(e) => setV({ ...v, cycleRef: e.target.value })} /><p className="mt-1 text-xs text-tinta-suave">Qualquer dia da semana que é “A”; o sistema usa a segunda-feira dela. As semanas seguintes alternam B, A, B… atravessando os meses.</p></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="s-o">Ordem</Label><Input id="s-o" type="number" min={0} max={999} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })} /></div>
        <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4 accent-[#0169E9]" /> Ativo</label>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}

export function SetupClient({ sectorId, hours, cycleRef, notes, posts, rules, members, kinds, canEdit }: {
  sectorId: string; hours: HoursMap; cycleRef: string; notes: string | null; posts: PostRow[]; rules: RuleRow[]; members: Opt[];
  kinds: { value: string; label: string; help: string }[]; canEdit: boolean;
}) {
  const { pending, error, run } = useAct();
  const [h, setH] = useState(hours);
  const [cycle, setCycle] = useState(cycleRef);
  const [post, setPost] = useState<PostRow | 'new' | null>(null);
  const [rule, setRule] = useState<RuleRow | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 font-bold text-navy">Horário habitual do setor</h2>
        <p className="mb-3 text-xs text-tinta-suave">Prioridade na geração: exceção do setor na data → funcionamento especial da Nação na data → este horário (e o de feriado) → horário geral da Nação.</p>
        <HoursMapEditor value={h} onChange={setH} />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div><Label htmlFor="cy">Início de uma semana A (ciclo A/B)</Label><Input id="cy" type="date" value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-44" /></div>
          {canEdit && <Button disabled={pending} onClick={() => run(() => saveSectorHoursAction(sectorId, { hours: h, cycleRef: cycle, notes }))}>Salvar horário e ciclo</Button>}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-navy">Postos e coberturas</h2>
          {canEdit && <Button size="sm" onClick={() => setPost('new')}><Plus /> Posto</Button>}
        </div>
        <p className="mb-2 text-xs text-tinta-suave">Quem cobre: quem está escalado do início ao fim do posto (e, se houver, com a função exigida).</p>
        <ul className="divide-y divide-borda">
          {posts.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-center gap-2 py-2 text-sm', !p.active && 'opacity-50')}>
              <Badge tone={p.mandatory ? 'navy' : 'neutral'}>{p.mandatory ? 'Obrigatória' : 'Preferencial'}</Badge>
              <b className="text-navy">{p.name}</b>{p.kind && <Badge tone="blue">{POST_KIND_LABEL[p.kind]}</Badge>}
              <span>{hhmm(p.startMin)}–{hhmm(p.endMin)} · mín. {p.minPeople}{p.functionName ? ` · ${p.functionName}` : ''}</span>
              <span className="text-xs text-tinta-suave">{p.weekdays.map((n) => (n === 8 ? 'feriado' : WEEKDAYS[n - 1]!.short.toLowerCase())).join('/')}</span>
              <span className="flex-1" />
              {canEdit && <><button type="button" aria-label="Editar" onClick={() => setPost(p)} className="text-tinta-fraca hover:text-nacao"><Pencil className="size-4" /></button>
                <button type="button" aria-label="Excluir" onClick={() => confirm('Excluir o posto?') && run(() => deletePostAction(sectorId, p.id))} className="text-tinta-fraca hover:text-critico"><Trash2 className="size-4" /></button></>}
            </li>
          ))}
          {!posts.length && <li className="py-2 text-sm text-tinta-suave">Nenhum posto: a escala não verifica cobertura de abertura/fechamento.</li>}
        </ul>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-navy">Regras de folga e revezamento</h2>
          {canEdit && <Button size="sm" disabled={members.length < 1} onClick={() => setRule('new')}><Plus /> Pré-requisito</Button>}
        </div>
        <ul className="divide-y divide-borda">
          {rules.map((r) => (
            <li key={r.id} className={cn('flex flex-wrap items-center gap-2 py-2 text-sm', !r.active && 'opacity-50')}>
              <Badge tone={r.mandatory ? 'navy' : 'neutral'}>{r.mandatory ? 'Obrigatória' : 'Preferencial'}</Badge>
              <span className="text-navy">{r.label}</span>{!r.active && <Badge>desativada</Badge>}
              <span className="flex-1" />
              {canEdit && <><button type="button" aria-label="Editar" onClick={() => setRule(r)} className="text-tinta-fraca hover:text-nacao"><Pencil className="size-4" /></button>
                <button type="button" aria-label="Excluir" onClick={() => confirm('Excluir o pré-requisito?') && run(() => deleteRuleAction(sectorId, r.id))} className="text-tinta-fraca hover:text-critico"><Trash2 className="size-4" /></button></>}
            </li>
          ))}
          {!rules.length && <li className="py-2 text-sm text-tinta-suave">Nenhuma regra. Folgas fixas individuais ficam no cadastro da equipe.</li>}
        </ul>
        <p className="mt-2 text-xs text-tinta-suave">Sempre verificado (não precisa cadastrar): a mesma pessoa em dois setores no mesmo horário, ausências, disponibilidade individual e os parâmetros legais.</p>
      </Card>
      <FormMessage error={error} />
      {post && <PostSheet sectorId={sectorId} post={post === 'new' ? null : post} onClose={() => setPost(null)} />}
      {rule && <RuleSheet sectorId={sectorId} rule={rule === 'new' ? null : rule} members={members} kinds={kinds} onClose={() => setRule(null)} />}
    </div>
  );
}

function PostSheet({ sectorId, post, onClose }: { sectorId: string; post: PostRow | null; onClose: () => void }) {
  const { pending, error, run } = useAct();
  const [v, setV] = useState({ name: post?.name ?? '', kind: post?.kind ?? '', start: formatClock(post?.startMin ?? 360), end: formatClock(Math.min(post?.endMin ?? 480, 1439)), weekdays: post?.weekdays ?? [1, 2, 3, 4, 5, 6, 7], minPeople: post?.minPeople ?? 1, functionName: post?.functionName ?? '', mandatory: post?.mandatory ?? true, sortOrder: post?.sortOrder ?? 0, active: post?.active ?? true });
  return (
    <Sheet title={post ? 'Editar posto' : 'Novo posto'} onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); run(() => savePostAction(sectorId, post?.id ?? null, { ...v, kind: v.kind || null, startMin: parseClock(v.start), endMin: v.end === '00:00' ? 1440 : parseClock(v.end) }), onClose); }}
      footer={<><Button type="submit" disabled={pending}>Salvar</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="p-n">Nome</Label><Input id="p-n" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Abertura" /></div>
        <div><Label htmlFor="p-k">Tipo</Label><Select id="p-k" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="">Outro</option>{Object.entries(POST_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
        <div><Label htmlFor="p-s">Das</Label><Input id="p-s" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></div>
        <div><Label htmlFor="p-e">Até</Label><Input id="p-e" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></div>
        <div><Label htmlFor="p-m">Mínimo de pessoas</Label><Input id="p-m" type="number" min={1} max={30} value={v.minPeople} onChange={(e) => setV({ ...v, minPeople: Number(e.target.value) || 1 })} /></div>
        <div><Label htmlFor="p-f">Só com a função (opcional)</Label><Input id="p-f" value={v.functionName} maxLength={60} onChange={(e) => setV({ ...v, functionName: e.target.value })} /></div>
      </div>
      <div><Label>Dias</Label><WeekdayPicker value={v.weekdays} onChange={(x) => setV({ ...v, weekdays: x })} withHoliday /><p className="mt-1 text-xs text-tinta-suave">FER = feriado (se nenhum posto tiver FER, o feriado usa os postos do dia da semana, recortados ao horário do dia).</p></div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.mandatory} onChange={(e) => setV({ ...v, mandatory: e.target.checked })} className="size-4 accent-[#0169E9]" /> Obrigatório</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4 accent-[#0169E9]" /> Ativo</label>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}

function MemberSelect({ id, members, value, onChange }: { id: string; members: Opt[]; value: string; onChange: (v: string) => void }) {
  return <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Escolha…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>;
}
function MemberMulti({ members, value, onChange, exclude = [] }: { members: Opt[]; value: string[]; onChange: (v: string[]) => void; exclude?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {members.filter((m) => !exclude.includes(m.id)).map((m) => {
        const on = value.includes(m.id);
        return <button key={m.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])} className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave')}>{m.name}</button>;
      })}
    </div>
  );
}

function RuleSheet({ sectorId, rule, members, kinds, onClose }: { sectorId: string; rule: RuleRow | null; members: Opt[]; kinds: { value: string; label: string; help: string }[]; onClose: () => void }) {
  const { pending, error, run } = useAct();
  const [kind, setKind] = useState(rule?.kind ?? 'FOLGA_FIXA');
  const [label, setLabel] = useState(rule?.label ?? '');
  const [mandatory, setMandatory] = useState(rule?.mandatory ?? true);
  const [active, setActive] = useState(rule?.active ?? true);
  const [p, setP] = useState<Record<string, unknown>>(rule?.params ?? {});
  const set = (k: string, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const str = (k: string) => (p[k] as string) ?? '';
  const arr = <T,>(k: string) => (p[k] as T[]) ?? [];
  const clock = (k: string) => (p[k] == null ? '' : formatClock(p[k] as number));
  const help = kinds.find((k) => k.value === kind)?.help;
  return (
    <Sheet title={rule ? 'Editar pré-requisito' : 'Novo pré-requisito'} onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); run(() => saveRuleAction(sectorId, rule?.id ?? null, { kind, label: rule && label === rule.label && JSON.stringify(p) !== JSON.stringify(rule.params) ? null : label, params: p, mandatory, active }), onClose); }}
      footer={<><Button type="submit" disabled={pending}>Salvar</Button><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button></>}>
      <div>
        <Label htmlFor="r-k">Tipo</Label>
        <Select id="r-k" value={kind} disabled={!!rule} onChange={(e) => { setKind(e.target.value); setP({}); }}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        {help && <p className="mt-1 text-xs text-tinta-suave">{help}</p>}
      </div>
      {(kind === 'FOLGA_FIXA' || kind === 'TRABALHA_SEMPRE') && (
        <>
          <div><Label htmlFor="r-m">Colaborador</Label><MemberSelect id="r-m" members={members} value={str('memberId')} onChange={(v) => set('memberId', v)} /></div>
          <div><Label>Dias</Label><WeekdayPicker value={arr<number>('weekdays')} onChange={(v) => set('weekdays', v)} /></div>
        </>
      )}
      {kind === 'ALTERNAR_FIM_DE_SEMANA' && (
        <>
          <div><Label>Grupo A (trabalha nas semanas A)</Label><MemberMulti members={members} value={arr<string>('groupA')} onChange={(v) => set('groupA', v)} exclude={arr<string>('groupB')} /></div>
          <div><Label>Grupo B (trabalha nas semanas B)</Label><MemberMulti members={members} value={arr<string>('groupB')} onChange={(v) => set('groupB', v)} exclude={arr<string>('groupA')} /></div>
          <div><Label>Dias que alternam</Label>
            <div className="flex gap-1">{[6, 7].map((n) => { const on = arr<number>('weekdays').includes(n); return <button key={n} type="button" onClick={() => set('weekdays', on ? arr<number>('weekdays').filter((x) => x !== n) : [...arr<number>('weekdays'), n].sort())} className={cn('h-8 rounded-md border px-3 text-xs font-bold', on ? 'border-nacao bg-nacao text-white' : 'border-borda text-tinta-suave')}>{WEEKDAYS[n - 1]!.long}</button>; })}</div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.compensate} onChange={(e) => set('compensate', e.target.checked)} className="size-4 accent-[#0169E9]" /> Compensa na quinzena (6 dias na semana do fim de semana, 4 na outra)</label>
        </>
      )}
      {kind === 'ALTERNAR_FOLGA' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="r-a">Pessoa 1</Label><MemberSelect id="r-a" members={members} value={str('memberA')} onChange={(v) => set('memberA', v)} /></div>
            <div><Label htmlFor="r-b">Pessoa 2</Label><MemberSelect id="r-b" members={members} value={str('memberB')} onChange={(v) => set('memberB', v)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i}><Label>{i === 0 ? 'Semana A: folga da pessoa 1' : 'Semana A: folga da pessoa 2'}</Label>
                <Select value={String(arr<number>('weekdays')[i] ?? '')} onChange={(e) => { const w = [...arr<number>('weekdays')]; w[i] = Number(e.target.value); set('weekdays', w); }}>
                  <option value="">—</option>{WEEKDAYS.map((w) => <option key={w.n} value={w.n}>{w.long}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <p className="text-xs text-tinta-suave">Na semana B as folgas se invertem.</p>
        </>
      )}
      {kind === 'EVITAR_FOLGA_JUNTA' && (
        <>
          <div><Label>Pessoas</Label><MemberMulti members={members} value={arr<string>('memberIds')} onChange={(v) => set('memberIds', v)} /></div>
          <div><Label>Em quais dias</Label><WeekdayPicker value={arr<number>('weekdays')} onChange={(v) => set('weekdays', v)} /></div>
        </>
      )}
      {kind === 'COBRE_FOLGA' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="r-c">Quem cobre</Label><MemberSelect id="r-c" members={members} value={str('coverId')} onChange={(v) => set('coverId', v)} /></div>
            <div><Label htmlFor="r-d">Quando folga</Label><MemberSelect id="r-d" members={members} value={str('coveredId')} onChange={(v) => set('coveredId', v)} /></div>
            <div><Label htmlFor="r-s">Das (vazio = horário de quem folga)</Label><Input id="r-s" type="time" value={clock('startMin')} onChange={(e) => set('startMin', parseClock(e.target.value))} /></div>
            <div><Label htmlFor="r-e">Até</Label><Input id="r-e" type="time" value={clock('endMin')} onChange={(e) => set('endMin', parseClock(e.target.value))} /></div>
          </div>
        </>
      )}
      {kind === 'MINIMO_PESSOAS' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div><Label htmlFor="r-s2">Das</Label><Input id="r-s2" type="time" value={clock('startMin')} onChange={(e) => set('startMin', parseClock(e.target.value))} /></div>
            <div><Label htmlFor="r-e2">Até</Label><Input id="r-e2" type="time" value={clock('endMin')} onChange={(e) => set('endMin', parseClock(e.target.value))} /></div>
            <div><Label htmlFor="r-n">Mínimo</Label><Input id="r-n" type="number" min={1} max={50} value={(p.min as number) ?? 1} onChange={(e) => set('min', Number(e.target.value) || 1)} /></div>
          </div>
          <div><Label>Dias</Label><WeekdayPicker value={arr<number>('weekdays')} onChange={(v) => set('weekdays', v)} /></div>
          <div><Label htmlFor="r-f">Só com a função (opcional)</Label><Input id="r-f" value={str('functionName')} onChange={(e) => set('functionName', e.target.value || null)} /></div>
        </>
      )}
      <div><Label htmlFor="r-l">Descrição (vazio = automática)</Label><Input id="r-l" value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} /></div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="size-4 accent-[#0169E9]" /> Obrigatória</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#0169E9]" /> Ativa</label>
      </div>
      <FormMessage error={error} />
    </Sheet>
  );
}
