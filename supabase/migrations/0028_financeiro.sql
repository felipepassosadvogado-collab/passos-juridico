-- Passos Juridico - etapa 0028: Financeiro (receitas e despesas do escritorio).
-- A prestacao de contas lanca sozinha os honorarios recebidos do processo; o resto e lancado a mao.
-- So o titular ve e mexe. Pode rodar mais de uma vez sem problema.
create table if not exists public.financeiro (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null default 'Outros',
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'recebido' check (status in ('previsto', 'recebido')),
  processo_numero text,
  cliente_id uuid references public.clientes(id) on delete set null,
  origem text not null default 'manual' check (origem in ('manual', 'prestacao')),
  documento_caminho text,
  obs text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists financeiro_data on public.financeiro (data desc);
create index if not exists financeiro_processo on public.financeiro (processo_numero);
alter table public.financeiro enable row level security;
drop policy if exists titular_financeiro on public.financeiro;
create policy titular_financeiro on public.financeiro for all to authenticated using (public.eh_titular()) with check (public.eh_titular());
revoke all on public.financeiro from anon;
grant select, insert, update, delete on public.financeiro to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'financeiro') then
    alter publication supabase_realtime add table public.financeiro;
  end if;
exception when undefined_object then null; end $$;
