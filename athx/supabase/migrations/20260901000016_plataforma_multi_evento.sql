-- ============================================================================
-- NAÇÃO HÍBRIDA · 0016 · DE APP DE UM EVENTO PARA PLATAFORMA
--
-- Até aqui o app servia UMA etapa. O slug do evento era constante de código
-- (src/lib/env.ts), então uma etapa nova exigia editar o código e publicar.
--
-- Agora:
--
--   o evento NO AR       é o que tem status = 'LIVE', e só pode haver um
--   os eventos ANTIGOS   ficam FINISHED, inteiros, consultáveis
--   um evento NOVO       nasce clonando as regras de um anterior
--
-- Nada é apagado nunca. Arquivar é trocar um status, não jogar fora — os
-- resultados de setembro continuam exatamente onde estão.
--
-- Também corrige aqui uma trava que ia morder na próxima etapa: a tabela de
-- duplas aceitava bateria 1 ou 2 e mais nada, enquanto o número de baterias
-- já tinha virado configuração livre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- No máximo um evento no ar.
--
-- Índice único parcial em vez de gatilho: o banco recusa o segundo LIVE por
-- estrutura, e não por código que alguém pode esquecer de chamar.
-- ---------------------------------------------------------------------------
create unique index if not exists events_um_so_no_ar
  on public.events ((status = 'LIVE'))
  where status = 'LIVE';

-- ---------------------------------------------------------------------------
-- Qual evento o site mostra.
--
-- A ordem de preferência, e o porquê de cada degrau:
--
--   1. o que está NO AR  — é a resposta normal
--   2. o ARQUIVADO mais recente — enquanto a próxima etapa é montada, o
--      público deve ver o resultado final da anterior, não uma tela vazia
--   3. qualquer um — só para uma instalação nova, que só tem rascunho, não
--      quebrar com "nenhum evento cadastrado"
--
-- O degrau 2 é o que falta numa regra ingênua. Ordenar só por data faz um
-- RASCUNHO de etapa futura, ainda sem duplas, roubar o lugar do evento que
-- acabou de acontecer — e o leaderboard público fica vazio justamente
-- enquanto a organização monta a etapa seguinte. DRAFT quer dizer "o
-- público não vê"; a regra tem de respeitar isso.
-- ---------------------------------------------------------------------------
create or replace function public.athx_evento_atual()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.events
  order by
    (status = 'LIVE') desc,
    (status = 'FINISHED') desc,
    date desc,
    created_at desc
  limit 1;
$$;

comment on function public.athx_evento_atual is
  'O evento que o site público mostra: o LIVE, ou o mais recente se nenhum estiver no ar.';

grant execute on function public.athx_evento_atual() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bateria livre.
--
-- `check (battery in (1, 2))` era verdade enquanto o evento tinha duas
-- baterias cravadas. Com o número de baterias configurável, uma etapa de
-- três baterias não conseguia inscrever ninguém na terceira — e o erro
-- apareceria no cadastro da dupla, longe da causa.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.teams'::regclass and conname = 'teams_battery_check'
  ) then
    alter table public.teams drop constraint teams_battery_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teams'::regclass and conname = 'teams_bateria_positiva'
  ) then
    alter table public.teams add constraint teams_bateria_positiva check (battery >= 1);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ativar um evento: ele entra no ar, o anterior é arquivado.
--
-- Uma operação só, dentro de uma transação, porque o estado intermediário
-- (dois LIVE, ou nenhum) não deve existir nem por um instante.
-- ---------------------------------------------------------------------------
create or replace function public.athx_ativar_evento(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode colocar um evento no ar.'
      using errcode = 'insufficient_privilege';
  end if;

  select name into v_nome from public.events where id = p_event;
  if v_nome is null then
    raise exception 'Evento não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Arquiva quem estava no ar. O índice único exige que isso venha primeiro.
  update public.events set status = 'FINISHED', updated_at = now()
  where status = 'LIVE' and id <> p_event;

  update public.events set status = 'LIVE', updated_at = now()
  where id = p_event;

  raise notice 'NACAO HIBRIDA: evento "%" entrou no ar', v_nome;
end;
$$;

grant execute on function public.athx_ativar_evento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Arquivar um evento sem colocar outro no ar.
-- ---------------------------------------------------------------------------
create or replace function public.athx_arquivar_evento(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode arquivar um evento.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.events set status = 'FINISHED', updated_at = now() where id = p_event;
end;
$$;

grant execute on function public.athx_arquivar_evento(uuid) to authenticated;

-- ============================================================================
-- CLONAR UM EVENTO
--
-- Copia a DEFINIÇÃO e as REGRAS. Não copia quem competiu nem o que fizeram.
--
--   copia:     configurações (desempate, política de CAP, baterias),
--              WODs, prescrição em blocos, provas, programação do dia
--   NÃO copia: duplas, homologações, lançamentos, auditoria
--
-- É isso que "mesmas regras do primeiro evento" significa na prática: a
-- etapa nova nasce pronta para receber inscrições, com o regulamento do
-- anterior, e nenhum resultado contaminando a classificação.
-- ============================================================================
create or replace function public.athx_clonar_evento(
  p_origem uuid,
  p_nome   text,
  p_slug   text,
  p_data   date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo uuid;
  v_slug text := lower(btrim(p_slug));
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode criar um evento.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(length(btrim(p_nome)), 0) < 3 then
    raise exception 'Dê um nome ao evento (mínimo de 3 caracteres).'
      using errcode = 'check_violation';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'O endereço "%" não serve. Use só letras minúsculas, números e hífen — por exemplo nacao-hibrida-marco.', v_slug
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.events where slug = v_slug) then
    raise exception 'Já existe um evento no endereço "%". Escolha outro.', v_slug
      using errcode = 'unique_violation';
  end if;

  if p_origem is not null and not exists (select 1 from public.events where id = p_origem) then
    raise exception 'O evento que você quer copiar não existe.' using errcode = 'no_data_found';
  end if;

  -- Nasce fora do ar: a organização monta as duplas e ativa quando quiser.
  insert into public.events (slug, name, date, status)
  values (v_slug, btrim(p_nome), p_data, 'DRAFT')
  returning id into v_novo;

  -- ---- Configurações -----------------------------------------------------
  -- Colunas nomeadas, não `s.*`: uma coluna nova em event_settings não pode
  -- fazer o clone gravar valor na coluna errada.
  if p_origem is null then
    insert into public.event_settings (event_id) values (v_novo);
  else
    insert into public.event_settings (
      event_id, tie_points_mode, dnf_policy,
      tie_breaker_1, tie_breaker_2, tie_breaker_3,
      live_mode, maintenance_mode, baterias
    )
    select v_novo, s.tie_points_mode, s.dnf_policy,
           s.tie_breaker_1, s.tie_breaker_2, s.tie_breaker_3,
           s.live_mode, s.maintenance_mode, s.baterias
    from public.event_settings s
    where s.event_id = p_origem;
  end if;

  if p_origem is null then
    return v_novo;
  end if;

  -- ---- WODs --------------------------------------------------------------
  insert into public.wods (
    event_id, numero, nome, formato, cap_segundos, resumo,
    permite_cap, regras, pendencias, ordem
  )
  select v_novo, w.numero, w.nome, w.formato, w.cap_segundos, w.resumo,
         w.permite_cap, w.regras, w.pendencias, w.ordem
  from public.wods w
  where w.event_id = p_origem;

  -- Daqui para baixo o pareamento é por `numero`, que é único no evento.
  -- Evita tabela temporária de mapeamento de ids.

  -- ---- Prescrição --------------------------------------------------------
  insert into public.wod_blocos (wod_id, ordem, janela, movimento, detalhe, masculino, feminino)
  select nw.id, b.ordem, b.janela, b.movimento, b.detalhe, b.masculino, b.feminino
  from public.wod_blocos b
  join public.wods ow on ow.id = b.wod_id and ow.event_id = p_origem
  join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero;

  -- ---- Provas ------------------------------------------------------------
  --
  -- Em DOIS passos, e a ordem importa: o gatilho athx_check_componentes
  -- recusa uma prova calculada cujos componentes ainda não existam. Lançadas
  -- primeiro, calculadas depois.
  insert into public.provas (
    wod_id, codigo, descricao, criterio, unidade, direcao, origem,
    por_atleta, componentes, pontua, ordem
  )
  select nw.id, p.codigo, p.descricao, p.criterio, p.unidade, p.direcao, p.origem,
         p.por_atleta, p.componentes, p.pontua, p.ordem
  from public.provas p
  join public.wods ow on ow.id = p.wod_id and ow.event_id = p_origem
  join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero
  where p.origem = 'DIGITADA';

  insert into public.provas (
    wod_id, codigo, descricao, criterio, unidade, direcao, origem,
    por_atleta, componentes, pontua, ordem
  )
  select nw.id, p.codigo, p.descricao, p.criterio, p.unidade, p.direcao, p.origem,
         p.por_atleta, p.componentes, p.pontua, p.ordem
  from public.provas p
  join public.wods ow on ow.id = p.wod_id and ow.event_id = p_origem
  join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero
  where p.origem = 'SOMA';

  -- ---- Programação do dia ------------------------------------------------
  insert into public.agenda (
    event_id, ordem, hora, titulo, detalhe, itens, nota, wod_id, bateria, destaque
  )
  select v_novo, a.ordem, a.hora, a.titulo, a.detalhe, a.itens, a.nota,
         nw.id, a.bateria, a.destaque
  from public.agenda a
  left join public.wods ow on ow.id = a.wod_id
  left join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero
  where a.event_id = p_origem;

  raise notice 'NACAO HIBRIDA: evento "%" criado a partir de outro', p_nome;
  return v_novo;
end;
$$;

grant execute on function public.athx_clonar_evento(uuid, text, text, date) to authenticated;

-- ============================================================================
-- COLABORADORES DA ORGANIZAÇÃO
--
-- Antes: liberar acesso exigia criar o usuário no painel do Supabase e rodar
-- um arquivo SQL na mão, porque admin_users é indexada por user_id — e o
-- user_id só existe depois que a pessoa tem conta.
--
-- Agora a organização AUTORIZA UM E-MAIL. A pessoa entra em /login, cria a
-- própria senha, e já tem acesso: athx_is_admin() passa a aceitar quem está
-- nesta lista. Ninguém digita senha de ninguém, e não é preciso expor a
-- chave mestra do banco na Vercel.
-- ============================================================================
create table if not exists public.admin_emails (
  email      text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  nome       text,
  -- Quem autorizou. Fica como rastro de responsabilidade.
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.admin_emails is
  'E-mails autorizados a administrar. A pessoa ganha acesso ao criar a conta, sem passo manual no painel.';

-- ---------------------------------------------------------------------------
-- Quem é admin: quem está em admin_users OU com e-mail autorizado.
--
-- Esta função é chamada em toda checagem de RLS, então as duas consultas são
-- de chave primária: uma por user_id, outra por e-mail.
-- ---------------------------------------------------------------------------
create or replace function public.athx_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.admin_users a where a.user_id = auth.uid()
    )
    or exists (
      select 1
      from auth.users u
      join public.admin_emails e on e.email = lower(u.email)
      where u.id = auth.uid()
    );
$$;

comment on function public.athx_is_admin is
  'true para quem está em admin_users (acesso histórico) ou tem o e-mail em admin_emails (autorização pela tela).';

-- ---------------------------------------------------------------------------
-- A lista de quem tem acesso, para a tela mostrar.
--
-- Une as duas origens e diz se a pessoa já criou a conta — a informação que
-- a organização precisa quando alguém reclama que "não consegue entrar".
-- ---------------------------------------------------------------------------
-- O `where athx_is_admin()` nas duas pernas não é redundância: esta view roda
-- como DONA (precisa, para ler auth.users), então o RLS das tabelas de baixo
-- não se aplica. Sem este filtro, qualquer pessoa logada — inclusive uma que
-- não é da organização — leria a lista de e-mails de quem administra.
create or replace view public.athx_equipe as
select
  e.email,
  e.nome,
  'AUTORIZADO'::text as origem,
  exists (select 1 from auth.users u where lower(u.email) = e.email) as tem_login,
  e.created_at
from public.admin_emails e
where public.athx_is_admin()
union all
select
  a.email,
  a.name as nome,
  'CADASTRADO'::text as origem,
  true as tem_login,
  a.created_at
from public.admin_users a
where public.athx_is_admin()
  and not exists (select 1 from public.admin_emails e where e.email = lower(a.email));

comment on view public.athx_equipe is
  'Quem tem acesso de organização, de onde veio esse acesso, e se já criou a conta.';

-- ---------------------------------------------------------------------------
-- Segurança: só a organização vê e mexe na própria lista.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.admin_emails to authenticated;
grant select on public.athx_equipe to authenticated;

alter table public.admin_emails enable row level security;

drop policy if exists admin_emails_admin_all on public.admin_emails;
create policy admin_emails_admin_all on public.admin_emails
  for all to authenticated
  using (public.athx_is_admin())
  with check (public.athx_is_admin());

-- admin_users tinha RLS ligado e nenhuma política — ou seja, ninguém lia.
-- A tela de colaboradores precisa ler para mostrar quem já tinha acesso.
grant select on public.admin_users to authenticated;

drop policy if exists admin_users_admin_read on public.admin_users;
create policy admin_users_admin_read on public.admin_users
  for select to authenticated
  using (public.athx_is_admin());

-- A view não pode rodar como security_invoker: ela lê auth.users, que o
-- papel `authenticated` não alcança. Roda como dona e é protegida pelo
-- grant acima, que só `authenticated` tem — e pela própria tela, que exige
-- admin antes de consultar.
alter view public.athx_equipe set (security_invoker = off);

-- ---------------------------------------------------------------------------
-- A primeira pessoa não pode se autorizar sozinha.
--
-- Quem já está em admin_users (o acesso criado no SQL, na instalação) é que
-- autoriza os demais. Se a lista estiver vazia e ninguém for admin ainda, o
-- caminho continua sendo supabase/tornar-admin.sql.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.admin_users) then
    raise notice 'NACAO HIBRIDA: nenhum admin cadastrado. Rode supabase/tornar-admin.sql para o primeiro acesso.';
  end if;
end;
$$;
