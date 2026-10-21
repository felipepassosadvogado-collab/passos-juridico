-- Passos Juridico - confirmacao do cliente apos o aviso, sinal de dificuldade de contato
-- e ligacao das tarefas automaticas (verificar confirmacao, lembrete 3 dias antes) ao aviso.
-- Pode rodar mais de uma vez sem problema.

alter table public.avisos_cliente add column if not exists confirmado_em timestamptz;
alter table public.avisos_cliente add column if not exists confirmado_por uuid references public.profiles (id);
alter table public.avisos_cliente add column if not exists dificuldade text;
alter table public.avisos_cliente add column if not exists dificuldade_em timestamptz;
alter table public.tarefas add column if not exists aviso_id uuid references public.avisos_cliente (id) on delete set null;
