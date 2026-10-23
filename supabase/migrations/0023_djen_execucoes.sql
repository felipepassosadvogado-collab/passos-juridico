-- Passos Juridico - etapa 0023: historico de cada busca no DJEN (para nunca confundir "falhou" com "nao teve publicacao").
-- Cada busca (automatica ou manual) grava uma linha: periodo consultado, cada variacao de nome/OAB, quantas
-- comunicacoes o DJEN disse que existiam e quantas foram baixadas, erros e avisos.
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.djen_execucoes (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  origem      text not null default 'automatica',
  ok          boolean not null default false,
  completa    boolean not null default false,
  desde       date,
  ate         date,
  consultas   jsonb not null default '[]',
  itens       integer not null default 0,
  novas       integer not null default 0,
  caixa       integer not null default 0,
  processos_novos integer not null default 0,
  erro        text,
  avisos      text[] not null default '{}',
  duracao_ms  integer
);
create index if not exists djen_execucoes_em on public.djen_execucoes (em desc);

alter table public.djen_execucoes enable row level security;
drop policy if exists leem_djen_execucoes on public.djen_execucoes;
create policy leem_djen_execucoes on public.djen_execucoes for select to authenticated using (public.membro_ativo());
-- gravacao so pelo servidor (chave de servico), que ignora RLS
