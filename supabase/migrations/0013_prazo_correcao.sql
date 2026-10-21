-- Passos Juridico - data para a correcao da peca (escolhida ao enviar para correcao).
-- Pode rodar mais de uma vez sem problema.

alter table public.tarefas add column if not exists correcao_ate date;
