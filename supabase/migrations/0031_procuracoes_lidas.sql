-- Passos Juridico - etapa 0031: procuracoes guardadas que nao viraram processo.
-- O Claude le os documentos guardados (procuracao, kit, escaneados) e anota contra quais bancos o cliente deu
-- poderes; a tela "Procurações sem processo" cruza com os processos e atendimentos. Cada documento e lido uma vez.
-- So o titular ve. Pode rodar mais de uma vez sem problema.
create table if not exists public.procuracoes_lidas (
  documento_id  uuid primary key references public.documentos (id) on delete cascade,
  cliente_id    uuid references public.clientes (id) on delete set null,
  eh_procuracao boolean not null default false,
  outorgante    text,
  cpf           text,
  data_doc      text,
  bancos        jsonb not null default '[]'::jsonb,   -- [{nome, codigo}]
  resumo        text,
  erro          text,
  conferidos    jsonb not null default '[]'::jsonb,   -- bancos marcados como "ja conferido" (nao vai virar acao)
  lido_em       timestamptz not null default now()
);
create index if not exists procuracoes_lidas_cliente on public.procuracoes_lidas (cliente_id);
alter table public.procuracoes_lidas enable row level security;
drop policy if exists titular_procuracoes on public.procuracoes_lidas;
create policy titular_procuracoes on public.procuracoes_lidas for all to authenticated
  using (public.eh_titular()) with check (public.eh_titular());
