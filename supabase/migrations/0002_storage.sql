-- Arquivos (RG, comprovantes, procurações, peças) num bucket privado.
-- Só membros ativos leem e enviam; só o titular apaga.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do nothing;

create policy "membros leem documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.membro_ativo());

create policy "membros enviam documentos" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.membro_ativo());

create policy "titular apaga documentos" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.eh_titular());
