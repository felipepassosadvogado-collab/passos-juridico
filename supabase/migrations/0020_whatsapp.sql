-- WhatsApp do escritorio conectado ao sistema (via Evolution API, lendo o QR-code).
-- Conversas por contato, mensagens recebidas e enviadas, ligadas ao cliente pelo telefone.
create table if not exists public.wa_conversas (
  id          uuid primary key default gen_random_uuid(),
  jid         text not null unique,           -- identificador do contato no WhatsApp
  telefone    text,                           -- so digitos, com 55
  nome        text,                           -- nome que aparece no WhatsApp do contato
  cliente_id  uuid references public.clientes (id) on delete set null,
  ultima_em   timestamptz not null default now(),
  ultima_texto text,
  nao_lidas   integer not null default 0,
  arquivada   boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index if not exists wa_conversas_ultima on public.wa_conversas (ultima_em desc);
create index if not exists wa_conversas_cliente on public.wa_conversas (cliente_id);

create table if not exists public.wa_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.wa_conversas (id) on delete cascade,
  wa_id       text unique,                    -- id da mensagem no WhatsApp (evita duplicar)
  de_mim      boolean not null default false, -- enviada pelo escritorio (sistema, celular ou Atende Direito)
  texto       text,
  tipo        text not null default 'texto',  -- texto, imagem, documento, audio, video, figurinha, outro
  anexo       text,                           -- caminho no Storage (quando ja baixado)
  anexo_nome  text,
  anexo_mime  text,
  status      text,                           -- enviando, enviada, entregue, lida, erro
  enviado_por uuid references public.profiles (id),
  bruto       jsonb,                          -- chave da mensagem, para baixar a midia depois
  em          timestamptz not null default now()
);
create index if not exists wa_mensagens_conversa on public.wa_mensagens (conversa_id, em);

alter table public.wa_conversas enable row level security;
alter table public.wa_mensagens enable row level security;
drop policy if exists wa_conversas_membros on public.wa_conversas;
create policy wa_conversas_membros on public.wa_conversas for all to authenticated using (public.membro_ativo()) with check (public.membro_ativo());
drop policy if exists wa_mensagens_membros on public.wa_mensagens;
create policy wa_mensagens_membros on public.wa_mensagens for all to authenticated using (public.membro_ativo()) with check (public.membro_ativo());

do $$
declare t text;
begin
  foreach t in array array['wa_conversas', 'wa_mensagens'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
