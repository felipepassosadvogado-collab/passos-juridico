-- Passos Juridico - etapa 0027: arquivos de ate 50 MB na pasta de documentos (antes: 20 MB).
-- 50 MB e o maximo por arquivo no plano gratuito do Supabase. Pode rodar mais de uma vez sem problema.
update storage.buckets set file_size_limit = 52428800 where id = 'documentos';
select id, file_size_limit / 1048576 as limite_mb from storage.buckets where id = 'documentos';
