-- ============================================================================
-- NAÇÃO ATHX · 0015 · A agenda e as baterias também viram dado
--
-- A programação do dia estava cravada em código (src/lib/wods.ts), com os
-- horários dos três workouts, duas baterias e os blocos de briefing e pódio.
-- Mudar o horário de uma bateria exigia deploy.
--
-- Agora a agenda é uma tabela, editável na tela de WODs:
--
--   · uma linha por momento do dia, na ordem em que acontece
--   · a linha de um workout aponta para o WOD e a bateria
--   · as outras (briefing, conferência, pódio) não apontam para nada
--
-- E o número de baterias sai de event_settings, em vez de ser sempre duas.
-- ============================================================================

alter table public.event_settings
  add column if not exists baterias integer not null default 2
    check (baterias between 1 and 20);

comment on column public.event_settings.baterias is
  'Quantas baterias o evento tem. A tela de duplas oferece de 1 até este número.';

create table if not exists public.agenda (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  ordem      integer not null default 1,
  hora       text not null,
  titulo     text not null,
  detalhe    text,
  -- Sub-itens, como o conteúdo do briefing.
  itens      text[] not null default '{}',
  -- Observação da organização, como o intervalo entre baterias.
  nota       text,
  -- Preenchidos quando a linha é a disputa de um workout.
  wod_id     uuid references public.wods(id) on delete cascade,
  bateria    integer check (bateria is null or bateria > 0),
  -- Dá peso visual na programação (o pódio, por exemplo).
  destaque   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_event_idx on public.agenda (event_id, ordem);

drop trigger if exists agenda_touch on public.agenda;
create trigger agenda_touch before update on public.agenda
for each row execute function public.athx_touch_updated_at();

alter table public.agenda enable row level security;

grant select on public.agenda to anon, authenticated;
grant insert, update, delete on public.agenda to authenticated;

drop policy if exists agenda_public_read on public.agenda;
create policy agenda_public_read on public.agenda for select using (true);

drop policy if exists agenda_admin_write on public.agenda;
create policy agenda_admin_write on public.agenda
  for all using (public.athx_is_admin()) with check (public.athx_is_admin());

-- ---------------------------------------------------------------------------
-- A programação da etapa de setembro, como estava no código.
-- ---------------------------------------------------------------------------
create or replace function public.athx_montar_agenda_setembro(v_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v1 uuid;
  v2 uuid;
  v3 uuid;
begin
  if exists (select 1 from public.agenda where event_id = v_event) then
    raise notice 'NAÇÃO ATHX · evento % já tem agenda, nada a fazer', v_event;
    return;
  end if;

  select id into v1 from public.wods where event_id = v_event and numero = 1;
  select id into v2 from public.wods where event_id = v_event and numero = 2;
  select id into v3 from public.wods where event_id = v_event and numero = 3;

  insert into public.agenda (event_id, ordem, hora, titulo, detalhe, itens, nota, wod_id, bateria, destaque) values
    (v_event, 1, '08h00', 'Aquecimento + Briefing', 'Presença obrigatória de todos os participantes',
     array['Aquecimento geral','Mobilidade e preparação','Apresentação dos workouts','Explicação das regras',
           'Orientações sobre execução dos movimentos','Estratégias e divisão das tarefas','Esclarecimento de dúvidas'],
     null, null, null, false),
    (v_event, 2, '09h00–09h16', 'Workout 01 — Bateria 1', 'Strength', '{}', null, v1, 1, false),
    (v_event, 3, '09h26–09h42', 'Workout 01 — Bateria 2', 'Strength', '{}', 'Intervalo de 14'' entre as baterias', v1, 2, false),
    (v_event, 4, '09h30–09h52', 'Workout 02 — Bateria 1', 'Endurance', '{}', null, v2, 1, false),
    (v_event, 5, '09h56–10h16', 'Workout 02 — Bateria 2', 'Endurance', '{}', 'Intervalo de 20'' entre as baterias', v2, 2, false),
    (v_event, 6, '10h12–10h32', 'Workout 03 — Bateria 1', 'Metcon', '{}', null, v3, 1, false),
    (v_event, 7, '10h36–10h56', 'Workout 03 — Bateria 2', 'Metcon', '{}', null, v3, 2, false),
    (v_event, 8, '11h00', 'Conferência / classificação', null, '{}', null, null, null, false),
    (v_event, 9, '11h30', 'Pódio', null, '{}', null, null, null, true);

  raise notice 'NAÇÃO ATHX · agenda do evento % montada', v_event;
end;
$$;

do $$
declare v_event uuid;
begin
  for v_event in select id from public.events loop
    perform public.athx_montar_agenda_setembro(v_event);
  end loop;
end;
$$;
