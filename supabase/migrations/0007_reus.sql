-- Passos Juridico - cadastro de reus (partes contrarias)
-- Lista para escolher o reu ao criar processo ou atendimento, com CNPJ e qualificacao
-- (usada na peticao inicial). Qualquer membro cadastra; so o titular apaga.
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.reus (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  qualificacao text,
  criado_por   uuid references public.profiles (id) default auth.uid(),
  criado_em    timestamptz not null default now()
);
create unique index if not exists reus_nome on public.reus (lower(nome));

alter table public.reus enable row level security;
drop policy if exists reus_leem on public.reus;
drop policy if exists reus_criam on public.reus;
drop policy if exists reus_alteram on public.reus;
drop policy if exists reus_titular_apaga on public.reus;
create policy reus_leem on public.reus for select to authenticated using (public.membro_ativo());
create policy reus_criam on public.reus for insert to authenticated with check (public.membro_ativo());
create policy reus_alteram on public.reus for update to authenticated using (public.membro_ativo()) with check (public.membro_ativo());
create policy reus_titular_apaga on public.reus for delete to authenticated using (public.eh_titular());

insert into public.reus (nome) values ('Instituto Nacional do Seguro Social - INSS') on conflict do nothing;
