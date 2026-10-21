-- Passos Juridico - chat: "visto por ultimo" de cada pessoa e leitura das mensagens pelo outro lado
-- (para os sinais de entregue e lida). Pode rodar mais de uma vez sem problema.

alter table public.profiles add column if not exists visto_em timestamptz;

drop policy if exists leituras_da_conversa on public.mensagens_lidas;
create policy leituras_da_conversa on public.mensagens_lidas for select to authenticated
  using (public.na_conversa(conversa));
