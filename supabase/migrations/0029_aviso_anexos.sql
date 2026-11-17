-- Passos Juridico - etapa 0029: arquivos guardados junto do aviso ao cliente (ex.: o PDF da prestacao de contas),
-- para serem enviados pelo WhatsApp com a mensagem, mesmo que o aviso seja enviado depois ou de outro computador.
-- Pode rodar mais de uma vez sem problema.
alter table public.avisos_cliente add column if not exists anexos jsonb not null default '[]'::jsonb;
