-- Agente do WhatsApp: quem esta atendendo cada conversa, sugestao de resposta, resumo para a equipe.
alter table public.wa_conversas add column if not exists atendimento text not null default 'agente';
alter table public.wa_conversas drop constraint if exists wa_conversas_atendimento_check;
alter table public.wa_conversas add constraint wa_conversas_atendimento_check check (atendimento in ('agente', 'equipe'));
alter table public.wa_conversas add column if not exists equipe_ate timestamptz;      -- a equipe assumiu ate esta hora
alter table public.wa_conversas add column if not exists aguardando_equipe boolean not null default false;
alter table public.wa_conversas add column if not exists resumo text;                -- resumo do agente para a equipe
alter table public.wa_conversas add column if not exists rascunho text;              -- resposta sugerida (modo rascunho)
alter table public.wa_conversas add column if not exists rascunho_em timestamptz;
alter table public.wa_conversas add column if not exists agente_estado jsonb not null default '{}';
alter table public.wa_conversas add column if not exists agente_lock timestamptz;
alter table public.wa_conversas add column if not exists saudado_em timestamptz;
alter table public.wa_mensagens add column if not exists agente boolean not null default false;
