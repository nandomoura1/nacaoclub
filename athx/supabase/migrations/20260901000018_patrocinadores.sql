-- ============================================================================
-- NAÇÃO HÍBRIDA · 0018 · PATROCINADORES E PARCEIROS
--
-- Quem paga a etapa aparece nela. O que esta migration cria:
--
--   patrocinadores            nome, logo, link e ordem de exibição
--   bucket "patrocinadores"   onde as imagens ficam, leitura pública
--
-- POR EVENTO, e não do clube: patrocínio se negocia por etapa, e a cota de
-- setembro não vale em novembro. Quem patrocina as duas aparece nas duas —
-- o clone de evento leva os parceiros junto, porque reenviar logomarca é o
-- trabalho caro e apagar uma linha é um clique.
--
-- ONDE APARECE: na faixa discreta do rodapé do site público e no rodapé do
-- telão. O telão é a vitrine de verdade — fica horas projetado num ginásio
-- cheio —, e não tem como poluir uma tela que existe só para isso.
-- ============================================================================

create table if not exists public.patrocinadores (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  nome       text not null check (length(btrim(nome)) > 0),
  -- Caminho dentro do bucket, não URL inteira: a URL pública é montada pelo
  -- app. Assim o projeto pode mudar de domínio sem reescrever cada linha.
  logo_path  text not null check (length(btrim(logo_path)) > 0),
  -- Para onde o logo leva. Vazio = logomarca sem link.
  site       text check (site is null or site ~* '^https?://'),
  -- Cota, só para a organização se organizar. Não muda o tamanho na tela.
  cota       text,
  ordem      integer not null default 1,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, nome)
);

create index if not exists patrocinadores_event_idx
  on public.patrocinadores (event_id, ordem);

drop trigger if exists patrocinadores_touch on public.patrocinadores;
create trigger patrocinadores_touch before update on public.patrocinadores
for each row execute function public.athx_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Segurança (§35): todo mundo lê, só a organização escreve.
--
-- Logomarca de patrocinador é feita para ser vista — a leitura é pública de
-- propósito, inclusive para quem não está logado.
-- ---------------------------------------------------------------------------
grant select on public.patrocinadores to anon, authenticated;
grant insert, update, delete on public.patrocinadores to authenticated;

alter table public.patrocinadores enable row level security;

drop policy if exists patrocinadores_public_read on public.patrocinadores;
create policy patrocinadores_public_read on public.patrocinadores
  for select using (true);

drop policy if exists patrocinadores_admin_write on public.patrocinadores;
create policy patrocinadores_admin_write on public.patrocinadores
  for all to authenticated
  using (public.athx_is_admin())
  with check (public.athx_is_admin());

-- ============================================================================
-- O BUCKET DAS IMAGENS
--
-- `public = true` faz o Storage servir os arquivos por URL direta, sem
-- assinatura e sem token. É o que se quer de uma logomarca: ela precisa
-- carregar no celular de qualquer pessoa no ginásio, inclusive sem login.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patrocinadores',
  'patrocinadores',
  true,
  2097152,  -- 2 MB: logomarca que passa disso está mal exportada
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Quem pode mexer nos arquivos.
--
-- A leitura pública o bucket já resolve. A ESCRITA precisa de política: sem
-- ela, qualquer pessoa autenticada — inclusive uma conta criada do nada em
-- /login — poderia subir arquivo no bucket do evento.
-- ---------------------------------------------------------------------------
drop policy if exists patrocinadores_leitura on storage.objects;
create policy patrocinadores_leitura on storage.objects
  for select using (bucket_id = 'patrocinadores');

drop policy if exists patrocinadores_envio on storage.objects;
create policy patrocinadores_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patrocinadores' and public.athx_is_admin());

drop policy if exists patrocinadores_troca on storage.objects;
create policy patrocinadores_troca on storage.objects
  for update to authenticated
  using (bucket_id = 'patrocinadores' and public.athx_is_admin())
  with check (bucket_id = 'patrocinadores' and public.athx_is_admin());

drop policy if exists patrocinadores_remocao on storage.objects;
create policy patrocinadores_remocao on storage.objects
  for delete to authenticated
  using (bucket_id = 'patrocinadores' and public.athx_is_admin());

-- ---------------------------------------------------------------------------
-- O clone de evento leva os patrocinadores.
--
-- Substitui athx_clonar_evento acrescentando um passo ao fim. O resto da
-- função continua idêntico — está repetida inteira porque CREATE OR REPLACE
-- exige o corpo completo.
-- ---------------------------------------------------------------------------
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
as $fn$
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

  insert into public.events (slug, name, date, status)
  values (v_slug, btrim(p_nome), p_data, 'DRAFT')
  returning id into v_novo;

  if p_origem is null then
    insert into public.event_settings (event_id) values (v_novo);
    return v_novo;
  end if;

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

  insert into public.wods (
    event_id, numero, nome, formato, cap_segundos, resumo,
    permite_cap, regras, pendencias, ordem
  )
  select v_novo, w.numero, w.nome, w.formato, w.cap_segundos, w.resumo,
         w.permite_cap, w.regras, w.pendencias, w.ordem
  from public.wods w
  where w.event_id = p_origem;

  insert into public.wod_blocos (wod_id, ordem, janela, movimento, detalhe, masculino, feminino)
  select nw.id, b.ordem, b.janela, b.movimento, b.detalhe, b.masculino, b.feminino
  from public.wod_blocos b
  join public.wods ow on ow.id = b.wod_id and ow.event_id = p_origem
  join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero;

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

  insert into public.agenda (
    event_id, ordem, hora, titulo, detalhe, itens, nota, wod_id, bateria, destaque
  )
  select v_novo, a.ordem, a.hora, a.titulo, a.detalhe, a.itens, a.nota,
         nw.id, a.bateria, a.destaque
  from public.agenda a
  left join public.wods ow on ow.id = a.wod_id
  left join public.wods nw on nw.event_id = v_novo and nw.numero = ow.numero
  where a.event_id = p_origem;

  -- Os parceiros vêm junto, apontando para o MESMO arquivo no bucket: a
  -- imagem não é duplicada, só referenciada de novo. Quem não renovou a
  -- cota sai com um clique na tela.
  insert into public.patrocinadores (event_id, nome, logo_path, site, cota, ordem, ativo)
  select v_novo, p.nome, p.logo_path, p.site, p.cota, p.ordem, p.ativo
  from public.patrocinadores p
  where p.event_id = p_origem;

  return v_novo;
end;
$fn$;

grant execute on function public.athx_clonar_evento(uuid, text, text, date) to authenticated;
