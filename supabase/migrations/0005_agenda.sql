-- Passos Juridico - agenda de audiencias e coletas de padrao grafotecnico
-- O ato marcado fica no proprio aviso ao cliente: modalidade (videoconferencia,
-- Justica Federal com horario agendado ou no horario de atendimento ao publico),
-- link da sala virtual, data limite e a marca de realizado.
-- Pode rodar mais de uma vez sem problema.

alter table public.avisos_cliente add column if not exists modalidade text;
alter table public.avisos_cliente add column if not exists link text;
alter table public.avisos_cliente add column if not exists realizado_em timestamptz;
alter table public.avisos_cliente add column if not exists realizado_por uuid references public.profiles (id);

alter table public.avisos_cliente drop constraint if exists avisos_modalidade_valida;
alter table public.avisos_cliente add constraint avisos_modalidade_valida
  check (modalidade is null or modalidade in ('video', 'jf_agendado', 'jf_balcao'));

create index if not exists avisos_agenda on public.avisos_cliente (data_evento) where realizado_em is null;
