-- Passos Juridico - aviso ao cliente pode ser marcado como "nao precisa avisar"
-- (status 'dispensado'), para concluir a analise sem deixar o aviso pendente.
-- Pode rodar mais de uma vez sem problema.

alter table public.avisos_cliente drop constraint if exists avisos_cliente_status_check;
alter table public.avisos_cliente add constraint avisos_cliente_status_check
  check (status in ('pendente', 'avisado', 'dispensado'));
