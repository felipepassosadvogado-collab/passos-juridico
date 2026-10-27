-- 0024: registro de tentativas de login erradas (limite contra adivinhacao de senha)
create table if not exists public.login_tentativas (
  id bigserial primary key,
  email text not null,
  ip text not null,
  em timestamptz not null default now()
);
create index if not exists login_tentativas_email on public.login_tentativas (email, em desc);
create index if not exists login_tentativas_ip on public.login_tentativas (ip, em desc);
alter table public.login_tentativas enable row level security;
-- sem politicas: so o servidor (service role) le e grava
revoke all on public.login_tentativas from anon, authenticated;
-- limpeza automatica: apaga registros com mais de 1 dia sempre que entra um novo
create or replace function public.limpa_login_tentativas() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.login_tentativas where em < now() - interval '1 day';
  return new;
end $$;
drop trigger if exists limpa_login_tentativas on public.login_tentativas;
create trigger limpa_login_tentativas after insert on public.login_tentativas for each statement execute function public.limpa_login_tentativas();
