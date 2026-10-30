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
