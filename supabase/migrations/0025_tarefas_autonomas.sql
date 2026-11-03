-- Passos Juridico - etapa 0025: tarefas autonomas (rotina do escritorio, sem processo nem atendimento).
-- Antes toda tarefa precisava de um processo ou de um atendimento. Agora tambem vale a tarefa cujo nome
-- comeca com "Tarefa autonoma:" (ex.: verificar os prazos do dia). As demais continuam exigindo o vinculo.
-- Pode rodar mais de uma vez sem problema.
alter table public.tarefas drop constraint if exists tarefas_check;
alter table public.tarefas drop constraint if exists tarefas_vinculo;
alter table public.tarefas add constraint tarefas_vinculo
  check (processo_numero is not null or caso_id is not null or descricao like U&'Tarefa aut\00F4noma:%');
