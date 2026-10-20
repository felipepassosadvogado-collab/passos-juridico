-- Passos Juridico - valor da causa e honorarios contratuais
-- Em cada processo e em cada atendimento pre-processual: valor da causa (vem da peticao
-- inicial gerada pelo sistema ou digitado) e o percentual de honorarios contratuais.
-- Pode rodar mais de uma vez sem problema.

alter table public.processos add column if not exists valor_causa numeric(14,2);
alter table public.processos add column if not exists honorarios_pct numeric(5,2);
alter table public.casos add column if not exists valor_causa numeric(14,2);
alter table public.casos add column if not exists honorarios_pct numeric(5,2);

alter table public.processos drop constraint if exists processos_honorarios_pct_ok;
alter table public.processos add constraint processos_honorarios_pct_ok check (honorarios_pct is null or (honorarios_pct >= 0 and honorarios_pct <= 100));
alter table public.casos drop constraint if exists casos_honorarios_pct_ok;
alter table public.casos add constraint casos_honorarios_pct_ok check (honorarios_pct is null or (honorarios_pct >= 0 and honorarios_pct <= 100));
