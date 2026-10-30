-- ============================================================================
-- NAÇÃO ATHX · RODAR AGORA
--
-- Junção das migrations 0012, 0013, 0014 e 0015 — o modelo genérico de
-- eventos (WODs e provas como dado), o motor em SQL, a segurança e a agenda.
--
-- COMO RODAR
--   1. Supabase → seu projeto nacao-athx → SQL Editor → New query
--   2. Cole ESTE arquivo inteiro
--   3. Run
--
-- É seguro rodar mais de uma vez: tudo é idempotente, e as tabelas antigas
-- (wod1_results, wod2_results, wod3_results) continuam intactas como rede de
-- segurança. Nenhum DROP acontece aqui.
--
-- No fim deve aparecer "Success. No rows returned".
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 20260901000012_evento_como_dado.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- NAÇÃO ATHX · 0012 · O EVENTO VIRA DADO
--
-- Até aqui o evento estava cravado no banco: três tabelas, uma por WOD, com
-- as colunas daquele workout. wod1_results tinha seis colunas de carga,
-- wod2_results tinha corrida e bike, wod3_results tinha tempo e CAP. Montar
-- uma etapa nova — com outros movimentos, outro número de provas, outras
-- unidades — exigia programador.
--
-- Agora o evento é descrito por tabelas:
--
--   wods          um workout: nome, formato, CAP, prescrição, regras
--   wod_blocos    a prescrição em blocos ("0–5 min · 1RM Strict Press")
--   provas        uma coisa que gera ranking e pontos dentro do workout
--   wod_entries   homologação da dupla naquele WOD (e se concluiu, no CAP)
--   prova_results o valor da dupla em cada prova
--
-- A organização monta tudo em /admin/wods. O motor não conhece "1A" nem
-- "corrida": lê o cadastro da prova — unidade, direção, origem — e aplica a
-- mesma regra em todas.
--
-- ----------------------------------------------------------------------------
-- OS RESULTADOS DE SETEMBRO SÃO MIGRADOS, NÃO APAGADOS.
--
-- As tabelas antigas continuam no banco, intactas, como rede de segurança.
-- Nenhum DROP acontece aqui. Uma migration futura pode removê-las depois de
-- a organização confirmar que a conversão ficou correta — e a conferência
-- está logo abaixo, no bloco de verificação.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'athx_unidade') then
    create type athx_unidade as enum ('KG', 'KM', 'METROS', 'SEGUNDOS', 'REPS', 'CALORIAS');
  end if;
  if not exists (select 1 from pg_type where typname = 'athx_direcao') then
    create type athx_direcao as enum ('MAIOR_VENCE', 'MENOR_VENCE');
  end if;
  if not exists (select 1 from pg_type where typname = 'athx_origem') then
    create type athx_origem as enum ('DIGITADA', 'SOMA');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Um workout
-- ---------------------------------------------------------------------------
create table if not exists public.wods (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  numero        integer not null check (numero > 0),
  nome          text not null check (length(btrim(nome)) > 0),
  formato       text,
  -- null = workout sem tempo limite.
  cap_segundos  integer check (cap_segundos is null or cap_segundos > 0),
  resumo        text,
  -- true em workout onde a dupla pode NÃO concluir dentro do CAP. Liga o
  -- campo "concluiu" no lançamento e faz a política de incompletos valer.
  permite_cap   boolean not null default false,
  regras        text[] not null default '{}',
  pendencias    text[] not null default '{}',
  ordem         integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, numero)
);

create index if not exists wods_event_idx on public.wods (event_id, ordem);

-- ---------------------------------------------------------------------------
-- A prescrição, em blocos
-- ---------------------------------------------------------------------------
create table if not exists public.wod_blocos (
  id         uuid primary key default gen_random_uuid(),
  wod_id     uuid not null references public.wods(id) on delete cascade,
  ordem      integer not null default 1,
  janela     text not null default '',
  movimento  text not null,
  detalhe    text,
  masculino  text,
  feminino   text
);

create index if not exists wod_blocos_wod_idx on public.wod_blocos (wod_id, ordem);

-- ---------------------------------------------------------------------------
-- Uma prova: o que gera ranking e pontos
-- ---------------------------------------------------------------------------
create table if not exists public.provas (
  id          uuid primary key default gen_random_uuid(),
  wod_id      uuid not null references public.wods(id) on delete cascade,
  codigo      text not null check (length(btrim(codigo)) > 0),
  descricao   text not null check (length(btrim(descricao)) > 0),
  criterio    text,
  unidade     athx_unidade not null,
  direcao     athx_direcao not null,
  origem      athx_origem not null default 'DIGITADA',
  -- true quando o resultado é lançado em dois campos, um por atleta.
  por_atleta  boolean not null default false,
  -- Códigos das provas somadas quando origem = 'SOMA'.
  componentes text[] not null default '{}',
  -- false deixa a prova ranqueada mas fora do total do evento.
  pontua      boolean not null default true,
  ordem       integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (wod_id, codigo),
  -- Prova calculada não é digitada, e não é por atleta.
  constraint provas_soma_coerente check (
    (origem = 'SOMA' and array_length(componentes, 1) >= 1 and por_atleta = false)
    or (origem = 'DIGITADA' and coalesce(array_length(componentes, 1), 0) = 0)
  )
);

create index if not exists provas_wod_idx on public.provas (wod_id, ordem);

-- ---------------------------------------------------------------------------
-- A dupla num WOD: homologação e conclusão
-- ---------------------------------------------------------------------------
create table if not exists public.wod_entries (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  wod_id     uuid not null references public.wods(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  status     athx_result_status not null default 'DRAFT',
  concluiu   boolean not null default false,
  volume     numeric(10,2) check (volume is null or volume >= 0),
  observacao text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wod_id, team_id)
);

create index if not exists wod_entries_event_idx on public.wod_entries (event_id);
create index if not exists wod_entries_team_idx on public.wod_entries (team_id);

-- ---------------------------------------------------------------------------
-- O valor da dupla em cada prova.
--
-- SEM colunas de rank e points, de propósito.
--
-- No modelo antigo o banco MATERIALIZAVA posição e pontos em colunas, e um
-- gatilho recalculava tudo a cada escrita. Isso trouxe três problemas
-- seguidos: o guarda de resultado travado barrava o próprio recálculo, a
-- auditoria era inundada por milhares de linhas de ruído, e cada coluna
-- derivada nova precisava ser cadastrada em três listas diferentes.
--
-- Agora a pontuação é uma VIEW (athx_prova_scores, logo abaixo). Ela calcula
-- na hora da leitura, a partir dos valores lançados. Não há o que
-- dessincronizar, não há gatilho para brigar com a trava, e o app continua
-- recalculando em TypeScript a partir das mesmas linhas cruas.
-- ---------------------------------------------------------------------------
create table if not exists public.prova_results (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  prova_id       uuid not null references public.provas(id) on delete cascade,
  team_id        uuid not null references public.teams(id) on delete cascade,
  -- Preenchidos quando a prova é por atleta; o motor soma os dois.
  valor_atleta_1 numeric(12,3) check (valor_atleta_1 is null or valor_atleta_1 >= 0),
  valor_atleta_2 numeric(12,3) check (valor_atleta_2 is null or valor_atleta_2 >= 0),
  -- Valor único quando a prova NÃO é por atleta.
  valor          numeric(12,3) check (valor is null or valor >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (prova_id, team_id)
);

create index if not exists prova_results_event_idx on public.prova_results (event_id);
create index if not exists prova_results_team_idx on public.prova_results (team_id);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'provas', 'wod_entries', 'prova_results'] loop
    execute format(
      'drop trigger if exists %1$s_touch on public.%1$s;
       create trigger %1$s_touch before update on public.%1$s
       for each row execute function public.athx_touch_updated_at();', t);
  end loop;
end;
$$;

-- ============================================================================
-- MIGRAÇÃO DOS DADOS DE SETEMBRO
--
-- Idempotente: se os WODs já existem, não duplica. Roda quantas vezes quiser.
-- ============================================================================
-- ---------------------------------------------------------------------------
-- A etapa de setembro, montada por função.
--
-- Chamada pela migração (para converter o evento que já existe) e pelo seed
-- (para uma instalação do zero vir com um evento completo). Quem monta uma
-- etapa nova não precisa dela: cria tudo em /admin/wods.
-- ---------------------------------------------------------------------------
create or replace function public.athx_montar_etapa_setembro(v_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wod1 uuid;
  v_wod2 uuid;
  v_wod3 uuid;
begin
  -- Evento que já tem WODs cadastrados não é tocado: a organização já montou
  -- o dele, e sobrescrever seria apagar trabalho.
  if exists (select 1 from public.wods where event_id = v_event) then
    raise notice 'NAÇÃO ATHX · evento % já tem WODs cadastrados, nada a fazer', v_event;
    return;
  end if;


    -- ---- WOD 1 · STRENGTH ------------------------------------------------
    insert into public.wods (event_id, numero, nome, formato, cap_segundos, resumo, permite_cap, regras, pendencias, ordem)
    values (
      v_event, 1, 'STRENGTH', 'CARGA MÁXIMA', 960,
      'Três blocos de tempo. A dupla usa uma única barra e é responsável por montar e trocar as cargas durante a prova. Cada atleta busca a maior carga válida em cada movimento.',
      false,
      array[
        'A dupla utiliza UMA única barra durante todo o workout.',
        'A montagem e a troca das cargas são responsabilidade da dupla.',
        'No Back Squat, as três repetições devem ser realizadas sem interrupção.',
        'No Deadlift, as cinco repetições devem ser consecutivas.'
      ],
      array[
        'Padrão técnico de cada levantamento não foi definido nesta especificação.',
        'Critério de validação de tentativa (juiz) não foi definido.'
      ],
      1
    ) returning id into v_wod1;

    insert into public.wod_blocos (wod_id, ordem, janela, movimento, detalhe) values
      (v_wod1, 1, '0–5 min', '1RM Strict Press', 'Cada atleta tem até 5 minutos para encontrar sua maior carga válida de 1 repetição.'),
      (v_wod1, 2, '5–10 min', '3RM Back Squat', 'Maior carga válida para 3 repetições consecutivas, sem interrupção.'),
      (v_wod1, 3, '10–16 min', '5RM Deadlift', 'Maior carga válida para 5 repetições consecutivas.');

    insert into public.provas (wod_id, codigo, descricao, criterio, unidade, direcao, origem, por_atleta, componentes, ordem) values
      (v_wod1, '1A', '1RM Strict Press', 'Soma dos dois atletas · maior vence', 'KG', 'MAIOR_VENCE', 'DIGITADA', true, '{}', 1),
      (v_wod1, '1B', '3RM Back Squat', 'Soma dos dois atletas · maior vence', 'KG', 'MAIOR_VENCE', 'DIGITADA', true, '{}', 2),
      (v_wod1, '1C', '5RM Deadlift', 'Soma dos dois atletas · maior vence', 'KG', 'MAIOR_VENCE', 'DIGITADA', true, '{}', 3),
      (v_wod1, '1D', 'Resultado total de cargas', 'Soma das cargas válidas dos dois atletas nos três movimentos · maior vence', 'KG', 'MAIOR_VENCE', 'SOMA', false, array['1A','1B','1C'], 4);

    -- ---- WOD 2 · ENDURANCE -----------------------------------------------
    insert into public.wods (event_id, numero, nome, formato, cap_segundos, resumo, permite_cap, regras, pendencias, ordem)
    values (
      v_event, 2, 'ENDURANCE', 'AMRAP 22''', 1320,
      'Realizado simultaneamente em Shuttle Run e Assault Bike. O atleta 1 inicia na corrida, o atleta 2 na bike, e a dupla define sua própria estratégia de divisão do trabalho durante os 22 minutos.',
      false,
      array[
        'O atleta pode permanecer correndo por múltiplos de 500 metros.',
        'A troca entre os atletas só pode ocorrer após a conclusão de 500 m ou de seus múltiplos: 500, 1.000, 1.500, 2.000 m…',
        'Não é permitido trocar em 300 m, 700 m, 1.200 m ou qualquer distância que não seja múltiplo de 500.',
        'Caso o atleta ultrapasse um múltiplo de 500 m, deve continuar até atingir o próximo múltiplo para realizar a troca.',
        'A distância final registrada é a que a dupla percorreu quando o cronômetro parou — pode não ser múltiplo de 500 m.'
      ],
      array['Penalidade para troca fora do múltiplo de 500 m não foi definida.'],
      2
    ) returning id into v_wod2;

    insert into public.wod_blocos (wod_id, ordem, janela, movimento, detalhe) values
      (v_wod2, 1, 'Atleta 1 inicia', 'Shuttle Run', 'Cada ciclo corresponde a 500 metros — 10 × 50 metros.'),
      (v_wod2, 2, 'Atleta 2 inicia', 'Assault Bike', 'Acumular a maior distância possível, em quilômetros, enquanto estiver na máquina.');

    insert into public.provas (wod_id, codigo, descricao, criterio, unidade, direcao, origem, por_atleta, componentes, ordem) values
      (v_wod2, '2A', 'Maior KM de corrida', 'Maior distância vence', 'KM', 'MAIOR_VENCE', 'DIGITADA', false, '{}', 1),
      (v_wod2, '2B', 'Maior KM de Assault Bike', 'Maior distância vence', 'KM', 'MAIOR_VENCE', 'DIGITADA', false, '{}', 2),
      (v_wod2, '2C', 'Soma dos KM (corrida + bike)', 'Maior soma vence', 'KM', 'MAIOR_VENCE', 'SOMA', false, array['2A','2B'], 3);

    -- ---- WOD 3 · METCON --------------------------------------------------
    insert into public.wods (event_id, numero, nome, formato, cap_segundos, resumo, permite_cap, regras, pendencias, ordem)
    values (
      v_event, 3, 'METCON', 'FOR TIME', 1200,
      'A dupla deve completar o percurso no menor tempo possível.',
      true,
      '{}',
      array[
        'ALTURA DO BOX JUMP OVER não foi definida.',
        'Critério de ordenação das duplas que não concluíram é configurável em /admin/settings e começa como "decisão manual" — nenhuma regra foi assumida.',
        'Padrão técnico dos movimentos e critérios de no-rep não foram definidos.'
      ],
      3
    ) returning id into v_wod3;

    insert into public.wod_blocos (wod_id, ordem, janela, movimento, masculino, feminino) values
      (v_wod3, 1, '1', '120 m Burpee Broad Jumps', null, null),
      (v_wod3, 2, '2', '120 Box Jump Over', null, null),
      (v_wod3, 3, '3', '60 m Sandbag Walking Lunge', '20 kg', '10 kg'),
      (v_wod3, 4, '4', '240 m 2DB Farm Carry', '50 lb cada dumbbell', '35 lb cada dumbbell'),
      (v_wod3, 5, '5', '120 Wall Ball', '20 lb', '14 lb'),
      (v_wod3, 6, '6', '120 m Burpee Broad Jumps', null, null);

    insert into public.provas (wod_id, codigo, descricao, criterio, unidade, direcao, origem, por_atleta, componentes, ordem) values
      (v_wod3, '3A', 'Tempo total', 'Menor tempo válido = melhor posição', 'SEGUNDOS', 'MENOR_VENCE', 'DIGITADA', false, '{}', 1);

    -- ======================================================================
    -- Os resultados lançados em setembro
    -- ======================================================================

    -- Homologação: uma linha por dupla por WOD, com o status que ela tinha.
    insert into public.wod_entries (event_id, wod_id, team_id, status, concluiu, volume)
    select v_event, v_wod1, w.team_id, w.status, true, null
    from public.wod1_results w where w.event_id = v_event
    on conflict (wod_id, team_id) do nothing;

    insert into public.wod_entries (event_id, wod_id, team_id, status, concluiu, volume)
    select v_event, v_wod2, w.team_id, w.status, true, null
    from public.wod2_results w where w.event_id = v_event
    on conflict (wod_id, team_id) do nothing;

    insert into public.wod_entries (event_id, wod_id, team_id, status, concluiu, volume)
    select v_event, v_wod3, w.team_id, w.status, w.completed, w.volume_completed
    from public.wod3_results w where w.event_id = v_event
    on conflict (wod_id, team_id) do nothing;

    -- Valores. 1D e 2C NÃO são migradas: são calculadas pelo motor, e
    -- copiá-las criaria uma segunda verdade que pode divergir.
    insert into public.prova_results (event_id, prova_id, team_id, valor_atleta_1, valor_atleta_2)
    select v_event, p.id, w.team_id, w.strict_press_athlete_1, w.strict_press_athlete_2
    from public.wod1_results w
    join public.provas p on p.wod_id = v_wod1 and p.codigo = '1A'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;

    insert into public.prova_results (event_id, prova_id, team_id, valor_atleta_1, valor_atleta_2)
    select v_event, p.id, w.team_id, w.back_squat_athlete_1, w.back_squat_athlete_2
    from public.wod1_results w
    join public.provas p on p.wod_id = v_wod1 and p.codigo = '1B'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;

    insert into public.prova_results (event_id, prova_id, team_id, valor_atleta_1, valor_atleta_2)
    select v_event, p.id, w.team_id, w.deadlift_athlete_1, w.deadlift_athlete_2
    from public.wod1_results w
    join public.provas p on p.wod_id = v_wod1 and p.codigo = '1C'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;

    insert into public.prova_results (event_id, prova_id, team_id, valor)
    select v_event, p.id, w.team_id, w.run_km
    from public.wod2_results w
    join public.provas p on p.wod_id = v_wod2 and p.codigo = '2A'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;

    insert into public.prova_results (event_id, prova_id, team_id, valor)
    select v_event, p.id, w.team_id, w.bike_km
    from public.wod2_results w
    join public.provas p on p.wod_id = v_wod2 and p.codigo = '2B'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;

    insert into public.prova_results (event_id, prova_id, team_id, valor)
    select v_event, p.id, w.team_id, w.time_seconds
    from public.wod3_results w
    join public.provas p on p.wod_id = v_wod3 and p.codigo = '3A'
    where w.event_id = v_event
    on conflict (prova_id, team_id) do nothing;


  raise notice 'NAÇÃO ATHX · evento % montado no modelo de WODs e provas', v_event;
end;
$$;

do $$
declare v_event uuid;
begin
  for v_event in select id from public.events loop
    perform public.athx_montar_etapa_setembro(v_event);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA DA MIGRAÇÃO
--
-- Conta o que havia e o que passou. Se algum número não bater, a migration
-- falha aqui em vez de deixar o evento meio convertido.
-- ---------------------------------------------------------------------------
do $$
declare
  v_antes  integer;
  v_depois integer;
begin
  -- Cada linha de wod1_results vira três lançamentos (1A, 1B, 1C).
  select count(*) * 3 into v_antes from public.wod1_results;
  select count(*) into v_depois
  from public.prova_results r
  join public.provas p on p.id = r.prova_id
  where p.codigo in ('1A', '1B', '1C');

  if v_antes <> v_depois then
    raise exception 'Migração do WOD 1 não bateu: % esperados, % migrados', v_antes, v_depois;
  end if;

  select count(*) * 2 into v_antes from public.wod2_results;
  select count(*) into v_depois
  from public.prova_results r
  join public.provas p on p.id = r.prova_id
  where p.codigo in ('2A', '2B');

  if v_antes <> v_depois then
    raise exception 'Migração do WOD 2 não bateu: % esperados, % migrados', v_antes, v_depois;
  end if;

  select count(*) into v_antes from public.wod3_results;
  select count(*) into v_depois
  from public.prova_results r
  join public.provas p on p.id = r.prova_id
  where p.codigo = '3A';

  if v_antes <> v_depois then
    raise exception 'Migração do WOD 3 não bateu: % esperados, % migrados', v_antes, v_depois;
  end if;

  raise notice 'NAÇÃO ATHX · conferência da migração: todos os lançamentos passaram';
end;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 20260901000013_motor_sql_generico.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- NAÇÃO ATHX · 0013 · O motor de pontuação em SQL, para o modelo genérico
--
-- Espelha src/lib/scoring/motor.ts e src/lib/scoring/overall.ts (§25).
--
-- Tudo é VIEW. O modelo antigo materializava posição e pontos em colunas e
-- usava gatilhos para mantê-las, o que rendeu três bugs seguidos: o guarda
-- de resultado travado barrava o próprio recálculo, a auditoria era inundada
-- pelo recálculo, e cada coluna derivada nova precisava ser lembrada em três
-- listas. Calculando na leitura, não existe o que dessincronizar.
--
-- A cadeia é:
--
--   athx_valores        valor bruto de cada prova (soma de atletas, soma de
--                       outras provas, ou o número lançado)
--   athx_prova_scores   posição e pontos de cada prova, por categoria
--   athx_wod_scores     total de cada WOD
--   athx_standings      a classificação, geral e por categoria
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Prova calculada só pode somar provas LANÇADAS.
--
-- Soma de soma abriria recursão, e o SQL resolveria em um nível enquanto o
-- TypeScript resolveria em todos — os dois motores discordariam. O formulário
-- já não oferece, e aqui o banco recusa.
-- ---------------------------------------------------------------------------
create or replace function public.athx_check_componentes()
returns trigger
language plpgsql
as $$
declare
  v_ruim text;
begin
  if new.origem <> 'SOMA' then
    return new;
  end if;

  select c.codigo into v_ruim
  from public.provas c
  where c.wod_id = new.wod_id
    and c.codigo = any(new.componentes)
    and c.origem <> 'DIGITADA'
  limit 1;

  if v_ruim is not null then
    raise exception 'A prova % é calculada e não pode entrar na soma de %. Some apenas provas lançadas.', v_ruim, new.codigo
      using errcode = 'check_violation';
  end if;

  -- Componente que não existe no WOD é erro de digitação, não escolha.
  select x into v_ruim
  from unnest(new.componentes) as x
  where not exists (
    select 1 from public.provas c where c.wod_id = new.wod_id and c.codigo = x
  )
  limit 1;

  if v_ruim is not null then
    raise exception 'A prova % não existe neste WOD.', v_ruim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists provas_componentes on public.provas;
create trigger provas_componentes before insert or update on public.provas
for each row execute function public.athx_check_componentes();

-- ---------------------------------------------------------------------------
-- athx_valores — o número que vai para o ranking
-- ---------------------------------------------------------------------------
drop view if exists public.athx_standings cascade;
drop view if exists public.athx_wod_scores cascade;
drop view if exists public.athx_prova_scores cascade;
drop view if exists public.athx_valores cascade;

create view public.athx_valores as
with digitadas as (
  select
    w.event_id,
    p.id as prova_id,
    r.team_id,
    case
      when p.por_atleta then
        case
          when r.valor_atleta_1 is null and r.valor_atleta_2 is null then null
          else round(coalesce(r.valor_atleta_1, 0) + coalesce(r.valor_atleta_2, 0), 3)
        end
      else round(r.valor, 3)
    end as valor
  from public.prova_results r
  join public.provas p on p.id = r.prova_id
  join public.wods w on w.id = p.wod_id
  where p.origem = 'DIGITADA'
),
somas as (
  select
    w.event_id,
    p.id as prova_id,
    d.team_id,
    -- Sem nenhuma parcela lançada, a soma não existe — é diferente de zero.
    case when bool_or(d.valor is not null)
         then round(sum(coalesce(d.valor, 0)), 3)
         else null end as valor
  from public.provas p
  join public.wods w on w.id = p.wod_id
  join public.provas c on c.wod_id = p.wod_id and c.codigo = any(p.componentes)
  join digitadas d on d.prova_id = c.id
  where p.origem = 'SOMA'
  group by w.event_id, p.id, d.team_id
)
select event_id, prova_id, team_id, valor from digitadas
union all
select event_id, prova_id, team_id, valor from somas;

comment on view public.athx_valores is
  'Valor bruto de cada prova por dupla: soma dos atletas, soma de outras provas, ou o número lançado.';

-- ---------------------------------------------------------------------------
-- athx_prova_scores — posição e pontos de cada prova, DENTRO DA CATEGORIA
-- ---------------------------------------------------------------------------
create view public.athx_prova_scores as
with cfg as (
  select event_id,
         coalesce(tie_points_mode, 'COMPETITION')::athx_tie_points_mode as modo,
         coalesce(dnf_policy, 'PENDING_DEFINITION')::athx_dnf_policy as politica
  from public.event_settings
),
elegiveis as (
  select
    w.event_id,
    p.id   as prova_id,
    p.direcao,
    t.id   as team_id,
    t.category,
    v.valor,
    w.permite_cap,
    coalesce(e.concluiu, false) as concluiu,
    e.volume
  from public.provas p
  join public.wods w on w.id = p.wod_id
  join public.teams t on t.event_id = w.event_id
  join public.wod_entries e on e.wod_id = w.id and e.team_id = t.id
  left join public.athx_valores v on v.prova_id = p.id and v.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
    and e.status in ('PUBLISHED', 'LOCKED')
    -- Workout com CAP: quem não concluiu entra mesmo sem valor, pelo volume.
    and (
      v.valor is not null
      or (w.permite_cap and not coalesce(e.concluiu, false) and e.volume is not null)
    )
),
-- Quem disputa pelo valor: todo mundo, ou só quem concluiu em WOD com CAP.
concluiram as (
  select * from elegiveis
  where not permite_cap or (concluiu and valor is not null)
),
incompletas as (
  select * from elegiveis
  where permite_cap and not (concluiu and valor is not null)
),
contagem as (
  select prova_id, category,
         count(*) filter (where true) as n_elegiveis,
         count(*) filter (where not permite_cap or (concluiu and valor is not null)) as n_concluiram,
         count(*) filter (where permite_cap and not (concluiu and valor is not null)) as n_incompletas
  from elegiveis
  group by prova_id, category
),
ranqueadas as (
  select
    c.event_id, c.prova_id, c.team_id, c.category,
    rank() over (
      partition by c.prova_id, c.category
      order by case when c.direcao = 'MAIOR_VENCE' then -c.valor else c.valor end
    ) as rnk,
    count(*) over (partition by c.prova_id, c.category, c.valor) as grp
  from concluiram c
),
finalizadores as (
  select
    r.event_id, r.prova_id, r.team_id, r.category,
    r.rnk as rank,
    athx_points_for(r.rnk, r.grp, cfg.modo) as points,
    r.grp > 1 as tied,
    r.grp > 1 as needs_decision
  from ranqueadas r
  join cfg on cfg.event_id = r.event_id
),
-- Quem não concluiu, conforme a política escolhida (§13/§48). Nada é
-- assumido: a regra vem de event_settings.dnf_policy.
por_volume as (
  select
    i.event_id, i.prova_id, i.team_id, i.category,
    rank() over (partition by i.prova_id, i.category order by coalesce(i.volume, 0) desc) as rnk,
    count(*) over (partition by i.prova_id, i.category, coalesce(i.volume, 0)) as grp,
    n.n_concluiram, n.n_elegiveis, n.n_incompletas
  from incompletas i
  join contagem n on n.prova_id = i.prova_id and n.category = i.category
),
nao_concluiram as (
  select
    v.event_id, v.prova_id, v.team_id, v.category,
    case cfg.politica
      when 'VOLUME_DESC' then v.rnk + v.n_concluiram
      when 'TIED_LAST'   then v.n_elegiveis
      else v.n_concluiram + 1
    end as rank,
    case cfg.politica
      when 'VOLUME_DESC' then athx_points_for(v.rnk, v.grp, cfg.modo) + v.n_concluiram
      when 'TIED_LAST'   then v.n_elegiveis::numeric
      else athx_points_for((v.n_concluiram + 1)::bigint, v.n_incompletas::bigint, cfg.modo)
    end as points,
    case cfg.politica
      when 'VOLUME_DESC' then v.grp > 1
      else v.n_incompletas > 1
    end as tied,
    case cfg.politica
      when 'VOLUME_DESC' then v.grp > 1
      when 'TIED_LAST'   then false
      else true
    end as needs_decision
  from por_volume v
  join cfg on cfg.event_id = v.event_id
)
select event_id, prova_id, team_id, category, rank, points, tied, needs_decision
from finalizadores
union all
select event_id, prova_id, team_id, category, rank, points::numeric, tied, needs_decision
from nao_concluiram;

comment on view public.athx_prova_scores is
  'Posição e pontos de cada prova, ranqueados DENTRO DA CATEGORIA. Espelha src/lib/scoring/motor.ts.';

-- ---------------------------------------------------------------------------
-- athx_wod_scores — o total de cada workout
-- ---------------------------------------------------------------------------
create view public.athx_wod_scores as
with por_wod as (
  select
    w.event_id,
    w.id as wod_id,
    t.id as team_id,
    t.category,
    count(*) filter (where p.pontua) as provas_que_pontuam,
    count(s.points) filter (where p.pontua) as provas_pontuadas,
    sum(s.points) filter (where p.pontua) as soma
  from public.wods w
  join public.teams t on t.event_id = w.event_id
  join public.provas p on p.wod_id = w.id
  left join public.athx_prova_scores s on s.prova_id = p.id and s.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
  group by w.event_id, w.id, t.id, t.category
),
completos as (
  select *,
    -- O WOD só tem total quando TODAS as provas dele foram pontuadas.
    (provas_que_pontuam > 0 and provas_pontuadas = provas_que_pontuam) as tem_resultado
  from por_wod
)
select
  c.event_id, c.wod_id, c.team_id, c.category,
  case when c.tem_resultado then c.soma end as points,
  case when c.tem_resultado then
    rank() over (
      partition by c.wod_id, c.category, c.tem_resultado
      order by c.soma asc
    )
  end as rank,
  c.tem_resultado as has_result,
  e.concluiu,
  e.volume
from completos c
left join public.wod_entries e on e.wod_id = c.wod_id and e.team_id = c.team_id;

comment on view public.athx_wod_scores is
  'Total de cada WOD: a soma das provas que pontuam, com a posição no workout dentro da categoria.';

-- ---------------------------------------------------------------------------
-- athx_standings — a classificação
--
-- `position` (geral) mistura as categorias e é só referência: ninguém
-- disputa contra outra categoria, então ali o desempate não age.
-- `category_position` é a que vale, e é nela que os critérios entram.
-- ---------------------------------------------------------------------------
create view public.athx_standings as
with cfg as (
  select event_id,
         upper(coalesce(tie_breaker_1, 'NENHUM')) as tb1,
         upper(coalesce(tie_breaker_2, 'NENHUM')) as tb2,
         upper(coalesce(tie_breaker_3, 'NENHUM')) as tb3
  from public.event_settings
),
total as (
  select
    w.event_id,
    t.id as team_id,
    coalesce(sum(s.points) filter (where p.pontua), 0) as total_points
  from public.teams t
  join public.wods w on w.event_id = t.event_id
  join public.provas p on p.wod_id = w.id
  left join public.athx_prova_scores s on s.prova_id = p.id and s.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
  group by w.event_id, t.id
),
completude as (
  select event_id, team_id, count(*) filter (where has_result) as scored_wods
  from public.athx_wod_scores
  group by event_id, team_id
),
-- A pontuação da dupla no WOD de cada critério de desempate.
criterios as (
  select
    t.id as team_id,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb1) as k1,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb2) as k2,
    max(ws.points) filter (where ('WOD' || w.numero) = c.tb3) as k3
  from public.teams t
  join public.wods w on w.event_id = t.event_id
  join cfg c on c.event_id = t.event_id
  left join public.athx_wod_scores ws on ws.wod_id = w.id and ws.team_id = t.id and ws.has_result
  group by t.id
),
base as (
  select
    t.id as team_id, t.event_id, t.team_number, t.team_name, t.category,
    t.athlete_1, t.athlete_2, t.battery, t.status as team_status,
    tot.total_points,
    coalesce(comp.scored_wods, 0) as scored_wods,
    k.k1, k.k2, k.k3
  from public.teams t
  join total tot on tot.team_id = t.id
  left join completude comp on comp.team_id = t.id
  left join criterios k on k.team_id = t.id
  where t.status <> 'DESCLASSIFICADA'
)
select
  b.*,
  -- Geral: completude e pontos, e nada mais.
  rank() over (
    partition by b.event_id
    order by b.scored_wods desc, b.total_points asc
  ) as position,
  -- Categoria: é aqui que o desempate decide o pódio.
  rank() over (
    partition by b.event_id, b.category
    order by b.scored_wods desc, b.total_points asc,
             b.k1 asc nulls last, b.k2 asc nulls last, b.k3 asc nulls last
  ) as category_position,
  -- Empate só existe dentro da categoria, e só quando nenhum critério separou.
  (
    count(*) over (
      partition by b.event_id, b.category, b.scored_wods, b.total_points, b.k1, b.k2, b.k3
    ) > 1
    and b.scored_wods > 0
  ) as tied
from base b;

comment on view public.athx_standings is
  'position = classificação geral, sem desempate (referência). category_position = a que vale, com os critérios de event_settings. Espelha src/lib/scoring/overall.ts.';

-- As views rodam com os privilégios de quem consulta, não de quem criou:
-- sem isto elas furariam o RLS.
alter view public.athx_valores      set (security_invoker = on);
alter view public.athx_prova_scores set (security_invoker = on);
alter view public.athx_wod_scores   set (security_invoker = on);
alter view public.athx_standings    set (security_invoker = on);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 20260901000014_rls_do_modelo_generico.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- NAÇÃO ATHX · 0014 · Segurança das tabelas novas (§35)
--
--   PÚBLICO  -> SELECT: a definição do evento é pública (todo mundo pode ler
--               a prescrição dos WODs), e os LANÇAMENTOS só quando
--               homologados (PUBLISHED/LOCKED)
--   ADMIN    -> INSERT / UPDATE / DELETE
--
-- Tabela nova com RLS desligado é tabela aberta. Este arquivo existe para
-- que isso não aconteça por esquecimento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Privilégios de tabela.
--
-- O RLS decide QUAIS LINHAS cada um vê; o GRANT decide se ele pode olhar a
-- tabela. Os dois são necessários — RLS sem grant recusa tudo, grant sem RLS
-- libera tudo. Explícito aqui em vez de depender do padrão da plataforma.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'wod_blocos', 'provas', 'wod_entries', 'prova_results'] loop
    execute format('grant select on public.%I to anon, authenticated;', t);
    execute format('grant insert, update, delete on public.%I to authenticated;', t);
  end loop;
end;
$$;

grant select on public.athx_valores, public.athx_prova_scores,
                public.athx_wod_scores, public.athx_standings
  to anon, authenticated;

alter table public.wods          enable row level security;
alter table public.wod_blocos    enable row level security;
alter table public.provas        enable row level security;
alter table public.wod_entries   enable row level security;
alter table public.prova_results enable row level security;

-- ---------------------------------------------------------------------------
-- A DEFINIÇÃO do evento é pública.
--
-- A prescrição dos workouts, as provas e os critérios são justamente o que o
-- atleta precisa ler antes de competir — a página /wod/1 existe para isso.
-- Esconder seria esconder o regulamento.
-- ---------------------------------------------------------------------------
drop policy if exists wods_public_read on public.wods;
create policy wods_public_read on public.wods for select using (true);

drop policy if exists blocos_public_read on public.wod_blocos;
create policy blocos_public_read on public.wod_blocos for select using (true);

drop policy if exists provas_public_read on public.provas;
create policy provas_public_read on public.provas for select using (true);

-- ---------------------------------------------------------------------------
-- Os LANÇAMENTOS, não. O público lê só o que foi homologado (§19).
--
-- Um rascunho é trabalho em andamento: o juiz ainda vai conferir com a
-- dupla. Vazar rascunho é anunciar resultado que pode mudar.
-- ---------------------------------------------------------------------------
drop policy if exists entries_public_read on public.wod_entries;
create policy entries_public_read on public.wod_entries
  for select using (status in ('PUBLISHED', 'LOCKED') or public.athx_is_admin());

drop policy if exists prova_results_public_read on public.prova_results;
create policy prova_results_public_read on public.prova_results
  for select using (
    public.athx_is_admin()
    or exists (
      select 1
      from public.provas p
      join public.wod_entries e on e.wod_id = p.wod_id and e.team_id = prova_results.team_id
      where p.id = prova_results.prova_id
        and e.status in ('PUBLISHED', 'LOCKED')
    )
  );

-- ---------------------------------------------------------------------------
-- Escrita: só admin, em tudo.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'wod_blocos', 'provas', 'wod_entries', 'prova_results'] loop
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format(
      'create policy %1$s_admin_write on public.%1$s
         for all using (public.athx_is_admin()) with check (public.athx_is_admin());', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resultado TRAVADO não muda por acidente (§20).
--
-- A trava protege o que foi LANÇADO. Como a pontuação agora é calculada na
-- leitura por uma view, não existe mais coluna derivada para o guarda
-- confundir com edição humana — o bug que travou a homologação em setembro
-- não tem como voltar.
-- ---------------------------------------------------------------------------
create or replace function public.athx_guard_entry_locked()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'LOCKED' then
    return new;
  end if;

  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return new;
  end if;

  raise exception 'Resultado LOCKED. Destrave com athx_unlock_entry() antes de alterar.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists wod_entries_locked on public.wod_entries;
create trigger wod_entries_locked before update or delete on public.wod_entries
for each row execute function public.athx_guard_entry_locked();

create or replace function public.athx_guard_result_locked()
returns trigger
language plpgsql
as $$
declare
  v_status athx_result_status;
  v_team   uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
  v_prova  uuid := case when tg_op = 'DELETE' then old.prova_id else new.prova_id end;
begin
  if coalesce(current_setting('athx.allow_locked_edit', true), 'off') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select e.status into v_status
  from public.wod_entries e
  join public.provas p on p.wod_id = e.wod_id
  where p.id = v_prova and e.team_id = v_team;

  if v_status = 'LOCKED' then
    raise exception 'Resultado LOCKED. Destrave com athx_unlock_entry() antes de alterar.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists prova_results_locked on public.prova_results;
create trigger prova_results_locked before update or delete on public.prova_results
for each row execute function public.athx_guard_result_locked();

-- ---------------------------------------------------------------------------
-- Destravar é explícito, exige motivo e fica na auditoria.
-- ---------------------------------------------------------------------------
create or replace function public.athx_unlock_entry(p_wod uuid, p_team uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_event uuid;
begin
  if not public.athx_is_admin() then
    raise exception 'Apenas a organização pode destravar um resultado.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(length(btrim(p_motivo)), 0) < 5 then
    raise exception 'Informe o motivo do destravamento (mínimo de 5 caracteres).'
      using errcode = 'check_violation';
  end if;

  select email into v_email from admin_users where user_id = auth.uid();
  select event_id into v_event from wod_entries where wod_id = p_wod and team_id = p_team;

  perform set_config('athx.allow_locked_edit', 'on', true);
  update wod_entries set status = 'PUBLISHED', updated_by = auth.uid()
  where wod_id = p_wod and team_id = p_team;
  perform set_config('athx.allow_locked_edit', 'off', true);

  insert into audit_logs (event_id, user_id, user_email, action, entity_type, entity_id, team_id, old_value, new_value)
  values (v_event, auth.uid(), v_email, 'UNLOCK', 'wod_entries', p_wod, p_team,
          jsonb_build_object('status', 'LOCKED'),
          jsonb_build_object('status', 'PUBLISHED', 'motivo', p_motivo));
end;
$$;

grant execute on function public.athx_unlock_entry(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria dos lançamentos novos.
--
-- Só o que é DIGITADO POR GENTE entra no histórico. Como não há mais coluna
-- derivada nestas tabelas, não há recálculo para inundar a auditoria.
-- ---------------------------------------------------------------------------
create or replace function public.athx_audit_prova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_event uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  v_team  uuid := case when tg_op = 'DELETE' then old.team_id else new.team_id end;
begin
  select email into v_email from admin_users where user_id = auth.uid();

  insert into audit_logs (
    event_id, user_id, user_email, action, entity_type, entity_id, team_id, old_value, new_value
  ) values (
    v_event, auth.uid(), v_email, tg_op, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    v_team,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wod_entries', 'prova_results'] loop
    execute format(
      'drop trigger if exists %1$s_audit on public.%1$s;
       create trigger %1$s_audit after insert or update or delete on public.%1$s
       for each row execute function public.athx_audit_prova();', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: a tela se atualiza sozinha quando o juiz lança (§34).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wods', 'provas', 'wod_entries', 'prova_results'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
exception
  when undefined_object then
    raise notice 'NAÇÃO ATHX · publicação supabase_realtime não existe neste banco (ok fora do Supabase)';
end;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 20260901000015_agenda_como_dado.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

