-- Passos Juridico - foto de cada membro da equipe
-- Bucket publico "fotos" (so imagens, ate 3 MB); cada pessoa troca a propria foto,
-- o titular troca a de qualquer um. A coluna profiles.foto guarda o endereco publico.
-- Pode rodar mais de uma vez sem problema.

alter table public.profiles add column if not exists foto text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "fotos: membro envia a propria" on storage.objects;
drop policy if exists "fotos: membro troca a propria" on storage.objects;
drop policy if exists "fotos: membro apaga a propria" on storage.objects;
create policy "fotos: membro envia a propria" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.membro_ativo() and (split_part(name, '/', 1) = auth.uid()::text or public.eh_titular()));
create policy "fotos: membro troca a propria" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.membro_ativo() and (split_part(name, '/', 1) = auth.uid()::text or public.eh_titular()));
create policy "fotos: membro apaga a propria" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.membro_ativo() and (split_part(name, '/', 1) = auth.uid()::text or public.eh_titular()));
