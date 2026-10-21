-- Registro de acesso por dia: primeiro uso, ultimo uso (provavel saida) e tempo ativo no sistema.
-- O navegador avisa a cada minuto enquanto a aba do sistema esta aberta e visivel.
create table if not exists public.acessos (
  usuario   uuid not null references public.profiles(id) on delete cascade,
  dia       date not null,
  primeiro  timestamptz not null default now(),
  ultimo    timestamptz not null default now(),
  segundos  integer not null default 0,
  primary key (usuario, dia)
);
alter table public.acessos enable row level security;
drop policy if exists acessos_ver on public.acessos;
create policy acessos_ver on public.acessos for select to authenticated using (usuario = auth.uid() or public.eh_titular());

create or replace function public.registrar_acesso() returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or not public.membro_ativo() then return; end if;
  insert into public.acessos (usuario, dia) values (auth.uid(), d)
  on conflict (usuario, dia) do update set
    segundos = public.acessos.segundos + case when now() - public.acessos.ultimo <= interval '150 seconds'
                 then extract(epoch from now() - public.acessos.ultimo)::int else 0 end,
    ultimo = now();
end $$;
revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;
