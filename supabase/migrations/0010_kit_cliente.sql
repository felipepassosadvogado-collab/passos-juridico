-- Passos Juridico - dados do kit procuracao guardados no cliente
-- Banco reu, percentual de honorarios e contratos impugnados preenchidos no kit,
-- para ja virem prontos no cadastro do processo e na peticao inicial.
-- Pode rodar mais de uma vez sem problema.

alter table public.clientes add column if not exists kit jsonb;
