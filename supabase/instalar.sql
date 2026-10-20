-- Passos Jurídico — esquema base
-- Equipe, clientes, processos, publicações do DJEN, tarefas, CRM pré-processual,
-- avisos ao cliente, notificações, chat e linha do tempo (auditoria).
-- Regras de negócio que precisam valer mesmo fora das telas ficam em triggers.

create extension if not exists unaccent with schema public;

-- busca sem acento (unaccent não é IMMUTABLE; este invólucro permite usá-lo em índices)
create or replace function public.sem_acento(t text) returns text
language sql immutable parallel safe as $$ select lower(public.unaccent('public.unaccent', coalesce(t, ''))) $$;

-- ───────────────────────── equipe ─────────────────────────
create type public.papel_t as enum ('titular', 'advogado', 'colaborador');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null default '',
  funcao      text not null default '',
  papel       public.papel_t not null default 'colaborador',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create or replace function public.membro_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo)
$$;

create or replace function public.eh_titular() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo and papel = 'titular')
$$;

-- novo usuário → perfil; o primeiro a entrar vira titular
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    (case when exists (select 1 from public.profiles) then 'colaborador' else 'titular' end)::public.papel_t
  );
  return new;
end $$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- ninguém promove a si mesmo: papel e ativo só o titular muda
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.eh_titular()
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo) then
    raise exception 'Só o titular altera o papel ou o acesso de um membro.';
  end if;
  if auth.uid() is not null and not public.eh_titular() and new.id <> auth.uid() then
    raise exception 'Você só pode alterar o seu próprio perfil.';
  end if;
  return new;
end $$;

create trigger perfil_protegido before update on public.profiles
  for each row execute function public.protege_perfil();

-- ───────────────────────── clientes ─────────────────────────
create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  cpf           text,
  rg            text,
  nascimento    date,
  nacionalidade text,
  estado_civil  text,
  profissao     text,
  nome_mae      text,
  telefone      text,
  email         text,
  endereco      text,
  cep           text,
  cidade        text,
  nb            text,
  obs           text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references public.profiles (id) default auth.uid(),
  atualizado_em timestamptz not null default now()
);
create unique index clientes_cpf_unico on public.clientes ((regexp_replace(cpf, '\D', '', 'g')))
  where cpf is not null and regexp_replace(cpf, '\D', '', 'g') <> '';
create index clientes_nome on public.clientes (public.sem_acento(nome));

-- ───────────────────────── processos ─────────────────────────
create table public.processos (
  numero          char(20) primary key check (numero ~ '^\d{20}$'),
  mascara         text generated always as (
                    substr(numero, 1, 7) || '-' || substr(numero, 8, 2) || '.' || substr(numero, 10, 4) || '.' ||
                    substr(numero, 14, 1) || '.' || substr(numero, 15, 2) || '.' || substr(numero, 17, 4)) stored,
  tribunal        text,
  orgao           text,
  cidade          text,
  classe          text,
  cliente_id      uuid references public.clientes (id) on delete set null,
  cliente_nome    text not null default '',
  reus            text[] not null default '{}',
  banco           text,
  fase            text,
  notas           text,
  responsavel     uuid references public.profiles (id),
  ultima_data     date,
  ultimo_ato      text,
  cadastro_manual boolean not null default false,
  criado_em       timestamptz not null default now()
);
create index processos_cliente on public.processos (cliente_id);
create index processos_fase on public.processos (fase);
create index processos_nome on public.processos (public.sem_acento(cliente_nome));

-- ───────────────────────── publicações do DJEN ─────────────────────────
create table public.publicacoes (
  id              bigint primary key,            -- id da comunicação no DJEN
  processo_numero char(20) not null references public.processos (numero) on delete cascade,
  data            date not null,                 -- data de disponibilização
  tipo_com        text,
  tipo_doc        text,
  orgao           text,
  texto           text,
  link            text,
  eproc           boolean generated always as (coalesce(texto, '') ~* 'intima[cç][aã]o realizada no sistema eproc') stored,
  analise         jsonb,
  triagem         text not null default 'pendente' check (triagem in ('pendente', 'concluida')),
  concluida_em    timestamptz,
  concluida_por   uuid references public.profiles (id),
  criado_em       timestamptz not null default now()
);
create index publicacoes_caixa on public.publicacoes (triagem, data);
create index publicacoes_processo on public.publicacoes (processo_numero, data desc);

-- ───────────────────────── CRM pré-processual ─────────────────────────
create table public.casos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes (id) on delete set null,
  nome            text not null,
  banco           text,
  contratos       text,
  etapa           text not null default 'Primeiro atendimento',
  responsavel     uuid references public.profiles (id),
  obs             text,
  processo_numero char(20) references public.processos (numero) on delete set null,
  criado_por      uuid references public.profiles (id) default auth.uid(),
  criado_em       timestamptz not null default now()
);

-- ───────────────────────── tarefas ─────────────────────────
create type public.status_tarefa as enum ('aberto', 'andamento', 'revisao', 'ajustes', 'aprovada', 'feito');

create table public.tarefas (
  id                   uuid primary key default gen_random_uuid(),
  processo_numero      char(20) references public.processos (numero) on delete cascade,
  caso_id              uuid references public.casos (id) on delete cascade,
  publicacao_id        bigint references public.publicacoes (id) on delete set null,
  tipo                 text,
  descricao            text not null check (length(trim(descricao)) > 0),
  vencimento           date,
  dias                 int,
  responsavel          uuid references public.profiles (id),
  revisor              uuid references public.profiles (id),
  status               public.status_tarefa not null default 'aberto',
  importante           boolean not null default false,
  urgente              boolean not null default false,
  criado_por           uuid references public.profiles (id) default auth.uid(),
  criado_em            timestamptz not null default now(),
  iniciado_em          timestamptz,
  enviado_em           timestamptz,
  devolvido_em         timestamptz,
  aprovado_em          timestamptz,
  aprovado_por         uuid references public.profiles (id),
  feito_em             timestamptz,
  feito_por            uuid references public.profiles (id),
  protocolo_avisado_em timestamptz,
  editado_em           timestamptz,
  editado_por          uuid references public.profiles (id),
  check (processo_numero is not null or caso_id is not null)
);
create index tarefas_resp on public.tarefas (responsavel, status, vencimento);
create index tarefas_processo on public.tarefas (processo_numero);
create index tarefas_pub on public.tarefas (publicacao_id);

-- documentos: anexos de clientes e de tarefas (o arquivo fica no Storage, bucket "documentos")
create table public.documentos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete cascade,
  tarefa_id  uuid references public.tarefas (id) on delete cascade,
  tipo       text,               -- rg, comprovante, procuracao, contrato, outro
  etapa      text,               -- envio, devolucao (anexos de correção)
  nome       text not null,
  caminho    text not null unique,
  tamanho    bigint,
  mime       text,
  por        uuid references public.profiles (id) default auth.uid(),
  em         timestamptz not null default now(),
  check (cliente_id is not null or tarefa_id is not null)
);

-- ───────────────────────── avisos ao cliente ─────────────────────────
create table public.avisos_cliente (
  id              uuid primary key default gen_random_uuid(),
  processo_numero char(20) not null references public.processos (numero) on delete cascade,
  publicacao_id   bigint unique references public.publicacoes (id) on delete set null,
  tipo_evento     text,
  data_evento     date,
  hora            time,
  local           text,
  orientacoes     text,
  mensagem        text,
  status          text not null default 'pendente' check (status in ('pendente', 'avisado')),
  canal           text,
  aberto_em       timestamptz,
  avisado_em      timestamptz,
  avisado_por     uuid references public.profiles (id),
  criado_por      uuid references public.profiles (id) default auth.uid(),
  criado_em       timestamptz not null default now()
);

-- ───────────────────────── notificações e chat ─────────────────────────
create table public.notificacoes (
  id              uuid primary key default gen_random_uuid(),
  para            uuid not null references public.profiles (id) on delete cascade,
  de              uuid references public.profiles (id) default auth.uid(),
  tipo            text not null,
  texto           text not null,
  processo_numero char(20) references public.processos (numero) on delete cascade,
  caso_id         uuid references public.casos (id) on delete cascade,
  tarefa_id       uuid references public.tarefas (id) on delete cascade,
  lida            boolean not null default false,
  em              timestamptz not null default now()
);
create index notificacoes_para on public.notificacoes (para, lida, em desc);

create table public.mensagens (
  id       uuid primary key default gen_random_uuid(),
  conversa text not null check (conversa = 'geral' or conversa ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  de       uuid not null references public.profiles (id) default auth.uid(),
  texto    text not null check (length(texto) between 1 and 4000),
  em       timestamptz not null default now()
);
create index mensagens_conversa on public.mensagens (conversa, em);

create table public.mensagens_lidas (
  usuario  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  conversa text not null,
  ate      timestamptz not null,
  primary key (usuario, conversa)
);

-- quem participa de uma conversa
create or replace function public.na_conversa(c text) returns boolean
language sql stable as $$
  select c = 'geral' or (c like 'dm:%' and position(auth.uid()::text in c) > 0)
$$;

-- ───────────────────────── linha do tempo (auditoria) ─────────────────────────
create table public.eventos (
  id              bigint generated always as identity primary key,
  processo_numero char(20) references public.processos (numero) on delete cascade,
  caso_id         uuid references public.casos (id) on delete cascade,
  tarefa_id       uuid references public.tarefas (id) on delete set null,
  publicacao_id   bigint references public.publicacoes (id) on delete set null,
  tipo            text not null,
  dados           jsonb not null default '{}',
  por             uuid references public.profiles (id) default auth.uid(),
  em              timestamptz not null default now()
);
create index eventos_processo on public.eventos (processo_numero, em);
create index eventos_caso on public.eventos (caso_id, em);

-- ───────────────────────── configuração ─────────────────────────
create table public.config (
  chave text primary key,
  valor jsonb not null default '{}'
);

-- ───────────────────────── regras das tarefas ─────────────────────────
-- 1. o responsável é fixado na criação (só se define quando estava vazio)
-- 2. iniciar, concluir, reabrir e enviar para correção: só o responsável
-- 3. aprovar ou devolver uma correção: só quem foi escolhido para corrigir
-- 4. tipo, descrição, prazo e marcas: quem criou a tarefa ou o titular
create or replace function public.regras_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then return new; end if;   -- importação e rotinas do servidor

  if new.responsavel is distinct from old.responsavel and old.responsavel is not null then
    raise exception 'O responsável da tarefa é definido na criação e não pode ser trocado.';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('aprovada', 'ajustes') and old.status = 'revisao' then
      if eu is distinct from old.revisor then
        raise exception 'Só quem foi escolhido para corrigir pode aprovar ou devolver.';
      end if;
    elsif eu is distinct from old.responsavel then
      raise exception 'Só o responsável pela tarefa pode mudar a situação dela.';
    end if;
    if new.status = 'revisao' and new.revisor is null then
      raise exception 'Escolha quem vai corrigir.';
    end if;
    if new.status = 'revisao' and new.revisor = old.responsavel then
      raise exception 'A correção precisa ser feita por outra pessoa.';
    end if;
    if new.status = 'feito' and old.status = 'revisao' then
      raise exception 'A tarefa está em correção. Aguarde a aprovação.';
    end if;
  end if;

  if (new.tipo, new.descricao, new.vencimento, new.dias, new.importante, new.urgente)
     is distinct from (old.tipo, old.descricao, old.vencimento, old.dias, old.importante, old.urgente) then
    if eu is distinct from old.criado_por and not public.eh_titular() then
      raise exception 'Só quem criou a tarefa pode editá-la.';
    end if;
    new.editado_em := now();
    new.editado_por := eu;
  end if;

  -- carimbos de cada passo
  if new.status is distinct from old.status then
    case new.status
      when 'andamento' then new.iniciado_em := coalesce(new.iniciado_em, now());
      when 'revisao'   then new.enviado_em := now();
      when 'ajustes'   then new.devolvido_em := now();
      when 'aprovada'  then new.aprovado_em := now(); new.aprovado_por := eu;
      when 'feito'     then new.feito_em := now(); new.feito_por := eu;
      when 'aberto'    then new.feito_em := null; new.feito_por := null;
    end case;
  end if;

  -- campos que nunca mudam
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  return new;
end $$;

create trigger tarefa_regras before update on public.tarefas
  for each row execute function public.regras_tarefa();

-- cada movimento da tarefa vai para a linha do tempo, sem depender das telas
create or replace function public.registra_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo_ev text;
  extra jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    tipo_ev := 'tarefa_criada';
  elsif new.status is distinct from old.status then
    tipo_ev := case new.status
      when 'andamento' then 'tarefa_iniciada'
      when 'revisao'   then 'correcao_enviada'
      when 'ajustes'   then 'correcao_devolvida'
      when 'aprovada'  then 'correcao_aprovada'
      when 'feito'     then 'tarefa_concluida'
      when 'aberto'    then 'tarefa_reaberta' end;
  elsif new.responsavel is distinct from old.responsavel then
    tipo_ev := 'tarefa_atribuida';
  elsif new.protocolo_avisado_em is distinct from old.protocolo_avisado_em and new.protocolo_avisado_em is not null then
    tipo_ev := 'protocolo_avisado';
  elsif new.editado_em is distinct from old.editado_em then
    tipo_ev := 'tarefa_editada';
    extra := jsonb_strip_nulls(jsonb_build_object(
      'antes', jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'importante', old.importante, 'urgente', old.urgente),
      'depois', jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'importante', new.importante, 'urgente', new.urgente)));
  else
    return new;
  end if;

  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (new.processo_numero, new.caso_id, new.id, new.publicacao_id, tipo_ev,
          jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'dias', new.dias,
                             'responsavel', new.responsavel, 'revisor', new.revisor,
                             'importante', new.importante, 'urgente', new.urgente,
                             'protocolo_avisado', tg_op = 'UPDATE' and new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null) || extra,
          coalesce(auth.uid(), new.criado_por));
  return new;
end $$;

create trigger tarefa_eventos after insert or update on public.tarefas
  for each row execute function public.registra_tarefa();

-- ───────────────────────── permissões (RLS) ─────────────────────────
-- Escritório pequeno: todo membro ativo lê e grava os dados de trabalho;
-- excluir é do titular; a linha do tempo não se altera nem se apaga.
alter table public.profiles        enable row level security;
alter table public.clientes        enable row level security;
alter table public.processos       enable row level security;
alter table public.publicacoes     enable row level security;
alter table public.casos           enable row level security;
alter table public.tarefas         enable row level security;
alter table public.documentos      enable row level security;
alter table public.avisos_cliente  enable row level security;
alter table public.notificacoes    enable row level security;
alter table public.mensagens       enable row level security;
alter table public.mensagens_lidas enable row level security;
alter table public.eventos         enable row level security;
alter table public.config          enable row level security;

create policy membros_leem on public.profiles for select to authenticated using (public.membro_ativo());
create policy edita_perfil on public.profiles for update to authenticated
  using (id = auth.uid() or public.eh_titular()) with check (id = auth.uid() or public.eh_titular());

do $$
declare t text;
begin
  foreach t in array array['clientes', 'processos', 'publicacoes', 'casos', 'tarefas', 'documentos', 'avisos_cliente'] loop
    execute format('create policy membros_leem on public.%I for select to authenticated using (public.membro_ativo())', t);
    execute format('create policy membros_criam on public.%I for insert to authenticated with check (public.membro_ativo())', t);
    execute format('create policy membros_alteram on public.%I for update to authenticated using (public.membro_ativo()) with check (public.membro_ativo())', t);
    execute format('create policy titular_exclui on public.%I for delete to authenticated using (public.eh_titular())', t);
  end loop;
end $$;

-- tarefa nova: quem cria é quem está logado
create policy criador_e_voce on public.tarefas as restrictive for insert to authenticated
  with check (criado_por = auth.uid());

create policy leem_eventos on public.eventos for select to authenticated using (public.membro_ativo());
create policy registram_eventos on public.eventos for insert to authenticated
  with check (public.membro_ativo() and por = auth.uid());

create policy minhas_notificacoes on public.notificacoes for select to authenticated using (para = auth.uid());
create policy marcar_lida on public.notificacoes for update to authenticated using (para = auth.uid()) with check (para = auth.uid());
create policy enviar_notificacao on public.notificacoes for insert to authenticated
  with check (public.membro_ativo() and de = auth.uid());

create policy ler_conversa on public.mensagens for select to authenticated using (public.membro_ativo() and public.na_conversa(conversa));
create policy escrever_conversa on public.mensagens for insert to authenticated
  with check (public.membro_ativo() and de = auth.uid() and public.na_conversa(conversa));

create policy minhas_leituras on public.mensagens_lidas for all to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());

create policy leem_config on public.config for select to authenticated using (public.membro_ativo());
create policy titular_configura on public.config for all to authenticated using (public.eh_titular()) with check (public.eh_titular());

-- tempo real para as telas que se atualizam sozinhas
alter publication supabase_realtime add table public.publicacoes, public.tarefas, public.notificacoes, public.mensagens;
-- Arquivos (RG, comprovantes, procurações, peças) num bucket privado.
-- Só membros ativos leem e enviam; só o titular apaga.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do nothing;

create policy "membros leem documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.membro_ativo());

create policy "membros enviam documentos" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.membro_ativo());

create policy "titular apaga documentos" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.eh_titular());
-- Passos Jurídico — etapas 2 a 4
-- Recado da correção nas tarefas, avisos internos automáticos, exclusão registrada
-- na linha do tempo e atualização em tempo real de todas as telas.
-- Pode rodar mais de uma vez sem problema.

-- ───────────── recado de quem envia ou devolve a peça para correção ─────────────
alter table public.tarefas add column if not exists nota_correcao text;

-- ───────────── linha do tempo das tarefas (agora com o recado da correção) ─────────────
create or replace function public.registra_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo_ev text;
  extra jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    tipo_ev := 'tarefa_criada';
  elsif new.status is distinct from old.status then
    tipo_ev := case new.status
      when 'andamento' then 'tarefa_iniciada'
      when 'revisao'   then 'correcao_enviada'
      when 'ajustes'   then 'correcao_devolvida'
      when 'aprovada'  then 'correcao_aprovada'
      when 'feito'     then 'tarefa_concluida'
      when 'aberto'    then 'tarefa_reaberta' end;
    if new.status in ('revisao', 'ajustes') and coalesce(new.nota_correcao, '') <> '' then
      extra := jsonb_build_object('nota', new.nota_correcao);
    end if;
  elsif new.responsavel is distinct from old.responsavel then
    tipo_ev := 'tarefa_atribuida';
  elsif new.protocolo_avisado_em is distinct from old.protocolo_avisado_em and new.protocolo_avisado_em is not null then
    tipo_ev := 'protocolo_avisado';
  elsif new.editado_em is distinct from old.editado_em then
    tipo_ev := 'tarefa_editada';
    extra := jsonb_strip_nulls(jsonb_build_object(
      'antes', jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'importante', old.importante, 'urgente', old.urgente),
      'depois', jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'importante', new.importante, 'urgente', new.urgente)));
  else
    return new;
  end if;

  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (new.processo_numero, new.caso_id, new.id, new.publicacao_id, tipo_ev,
          jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'dias', new.dias,
                             'responsavel', new.responsavel, 'revisor', new.revisor,
                             'importante', new.importante, 'urgente', new.urgente,
                             'protocolo_avisado', tg_op = 'UPDATE' and new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null) || extra,
          coalesce(auth.uid(), new.criado_por));
  return new;
end $$;

-- ───────────── avisos internos (sino) gerados pelo próprio banco ─────────────
-- tarefa nova para outra pessoa, peça enviada para correção, devolvida, aprovada e protocolo avisado
create or replace function public.avisa_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  para_quem uuid;
  tipo_n text;
  txt text;
begin
  if eu is null then return new; end if;   -- importação e rotinas do servidor não avisam ninguém
  if tg_op = 'INSERT' then
    if new.responsavel is not null and new.responsavel <> eu then
      para_quem := new.responsavel; tipo_n := 'tarefa'; txt := 'Nova tarefa para você: ' || new.descricao;
    end if;
  elsif new.status is distinct from old.status and new.status = 'revisao' then
    para_quem := new.revisor; tipo_n := 'correcao'; txt := 'Peça para corrigir: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'ajustes' then
    para_quem := new.responsavel; tipo_n := 'ajustes'; txt := 'Peça devolvida com ajustes: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'aprovada' then
    para_quem := new.responsavel; tipo_n := 'aprovada'; txt := 'Peça aprovada, pode protocolar: ' || new.descricao;
  elsif new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    para_quem := coalesce(new.revisor, new.criado_por); tipo_n := 'protocolo'; txt := 'Protocolo realizado: ' || new.descricao;
  end if;
  if para_quem is not null and para_quem <> eu then
    insert into public.notificacoes (para, de, tipo, texto, processo_numero, caso_id, tarefa_id)
    values (para_quem, eu, tipo_n, txt, new.processo_numero, new.caso_id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists tarefa_avisos on public.tarefas;
create trigger tarefa_avisos after insert or update on public.tarefas
  for each row execute function public.avisa_tarefa();

-- ───────────── tarefa excluída fica registrada na linha do tempo ─────────────
create or replace function public.registra_exclusao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- tarefa apagada junto com o processo ou o atendimento: não há onde registrar
  if (old.processo_numero is not null and not exists (select 1 from public.processos where numero = old.processo_numero))
     or (old.processo_numero is null and old.caso_id is not null and not exists (select 1 from public.casos where id = old.caso_id)) then
    return old;
  end if;
  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (old.processo_numero, old.caso_id, null, old.publicacao_id, 'tarefa_excluida',
          jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'responsavel', old.responsavel),
          coalesce(auth.uid(), old.criado_por));
  return old;
end $$;

drop trigger if exists tarefa_excluida on public.tarefas;
create trigger tarefa_excluida before delete on public.tarefas
  for each row execute function public.registra_exclusao();

-- ───────────── arquivos: permitir substituir um arquivo enviado de novo ─────────────
drop policy if exists "membros atualizam documentos" on storage.objects;
create policy "membros atualizam documentos" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.membro_ativo()) with check (bucket_id = 'documentos' and public.membro_ativo());

-- ───────────── tempo real em todas as telas ─────────────
do $$
declare t text;
begin
  foreach t in array array['processos', 'clientes', 'publicacoes', 'casos', 'tarefas', 'documentos', 'avisos_cliente',
                           'notificacoes', 'mensagens', 'mensagens_lidas', 'eventos', 'config', 'profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────── configuração inicial ─────────────
insert into public.config (chave, valor) values ('djen', '{}'), ('geral', '{}') on conflict (chave) do nothing;

select 'Etapas 2 a 4 instaladas: ok' as resultado;
-- Passos Juridico - protocolo da peticao informado na tarefa
-- Quem protocola informa o no do protocolo/evento; data e hora sao as do clique (relogio do servidor).
-- Aparece na tarefa, na linha do tempo do processo e no sino de quem corrigiu/criou.
-- Pode rodar mais de uma vez sem problema.

alter table public.tarefas add column if not exists protocolo_numero text;
alter table public.tarefas add column if not exists protocolo_obs text;

-- carimbo de data e hora do protocolo pelo servidor
create or replace function public.carimba_protocolo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    new.protocolo_avisado_em := now();
    new.protocolo_numero := nullif(trim(coalesce(new.protocolo_numero, '')), '');
    new.protocolo_obs := nullif(trim(coalesce(new.protocolo_obs, '')), '');
  end if;
  return new;
end $$;
drop trigger if exists tarefa_protocolo on public.tarefas;
create trigger tarefa_protocolo before update on public.tarefas
  for each row execute function public.carimba_protocolo();

-- linha do tempo: o evento leva o no do protocolo, a observacao e o horario
create or replace function public.registra_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo_ev text;
  extra jsonb := '{}';
  protocolou boolean := tg_op = 'UPDATE' and new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null;
begin
  if tg_op = 'INSERT' then
    tipo_ev := 'tarefa_criada';
  elsif new.status is distinct from old.status then
    tipo_ev := case new.status
      when 'andamento' then 'tarefa_iniciada'
      when 'revisao'   then 'correcao_enviada'
      when 'ajustes'   then 'correcao_devolvida'
      when 'aprovada'  then 'correcao_aprovada'
      when 'feito'     then 'tarefa_concluida'
      when 'aberto'    then 'tarefa_reaberta' end;
    if new.status in ('revisao', 'ajustes') and coalesce(new.nota_correcao, '') <> '' then
      extra := jsonb_build_object('nota', new.nota_correcao);
    end if;
  elsif new.responsavel is distinct from old.responsavel then
    tipo_ev := 'tarefa_atribuida';
  elsif protocolou then
    tipo_ev := 'protocolo_avisado';
  elsif new.editado_em is distinct from old.editado_em then
    tipo_ev := 'tarefa_editada';
    extra := jsonb_strip_nulls(jsonb_build_object(
      'antes', jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'importante', old.importante, 'urgente', old.urgente),
      'depois', jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'importante', new.importante, 'urgente', new.urgente)));
  else
    return new;
  end if;
  if protocolou then
    extra := extra || jsonb_strip_nulls(jsonb_build_object('protocolo', new.protocolo_numero, 'protocolo_obs', new.protocolo_obs, 'protocolo_em', new.protocolo_avisado_em));
  end if;

  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (new.processo_numero, new.caso_id, new.id, new.publicacao_id, tipo_ev,
          jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'dias', new.dias,
                             'responsavel', new.responsavel, 'revisor', new.revisor,
                             'importante', new.importante, 'urgente', new.urgente,
                             'protocolo_avisado', protocolou) || extra,
          coalesce(auth.uid(), new.criado_por));
  return new;
end $$;

-- sino: o aviso de protocolo ja diz o numero
create or replace function public.avisa_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  para_quem uuid;
  tipo_n text;
  txt text;
begin
  if eu is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.responsavel is not null and new.responsavel <> eu then
      para_quem := new.responsavel; tipo_n := 'tarefa'; txt := U&'Nova tarefa para voc\00EA: ' || new.descricao;
    end if;
  elsif new.status is distinct from old.status and new.status = 'revisao' then
    para_quem := new.revisor; tipo_n := 'correcao'; txt := U&'Pe\00E7a para corrigir: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'ajustes' then
    para_quem := new.responsavel; tipo_n := 'ajustes'; txt := U&'Pe\00E7a devolvida com ajustes: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'aprovada' then
    para_quem := new.responsavel; tipo_n := 'aprovada'; txt := U&'Pe\00E7a aprovada, pode protocolar: ' || new.descricao;
  elsif new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    para_quem := coalesce(new.revisor, new.criado_por); tipo_n := 'protocolo';
    txt := 'Protocolado' || coalesce(U&' (n\00BA ' || new.protocolo_numero || ')', '') || ' em '
           || to_char(new.protocolo_avisado_em at time zone 'America/Sao_Paulo', U&'DD/MM/YYYY "\00E0s" HH24:MI') || ': ' || new.descricao;
  end if;
  if para_quem is not null and para_quem <> eu then
    insert into public.notificacoes (para, de, tipo, texto, processo_numero, caso_id, tarefa_id)
    values (para_quem, eu, tipo_n, txt, new.processo_numero, new.caso_id, new.id);
  end if;
  return new;
end $$;
