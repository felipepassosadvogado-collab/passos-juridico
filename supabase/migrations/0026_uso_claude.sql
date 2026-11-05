-- Passos Juridico - etapa 0026: painel de consumo do Claude.
-- Cada chamada a API da Anthropic grava quantos tokens usou, o modelo e a funcao do sistema (pecas, WhatsApp, DJEN...).
-- So o servidor grava; so o titular le. Pode rodar mais de uma vez sem problema.
create table if not exists public.uso_claude (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  operacao text not null,
  modelo text not null,
  entrada integer not null default 0,
  saida integer not null default 0,
  cache_leitura integer not null default 0,
  cache_escrita integer not null default 0,
  ms integer
);
create index if not exists uso_claude_em on public.uso_claude (em desc);
alter table public.uso_claude enable row level security;
drop policy if exists titular_le_uso on public.uso_claude;
create policy titular_le_uso on public.uso_claude for select to authenticated using (public.eh_titular());
revoke insert, update, delete on public.uso_claude from anon, authenticated;
