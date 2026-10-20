-- Passos Juridico - chat com imagens e arquivos
-- A mensagem pode levar um anexo (foto, print ou PDF) guardado no Storage, em chat/...
-- Pode rodar mais de uma vez sem problema.

alter table public.mensagens add column if not exists anexo text;
alter table public.mensagens add column if not exists anexo_nome text;
alter table public.mensagens add column if not exists anexo_tipo text;

-- o texto pode ficar vazio quando a mensagem e so uma imagem
alter table public.mensagens drop constraint if exists mensagens_texto_check;
alter table public.mensagens drop constraint if exists mensagens_texto_ou_anexo;
alter table public.mensagens add constraint mensagens_texto_ou_anexo
  check (length(texto) <= 4000 and (length(texto) >= 1 or anexo is not null));
alter table public.mensagens alter column texto set default '';
