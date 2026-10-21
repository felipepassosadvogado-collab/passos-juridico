-- Passos Juridico - liga a tarefa de protocolo a peca aprovada que a originou
-- (quando o protocolo e concluido, a tarefa da peca tambem e concluida).
-- Pode rodar mais de uma vez sem problema.

alter table public.tarefas add column if not exists origem_id uuid references public.tarefas (id) on delete set null;
