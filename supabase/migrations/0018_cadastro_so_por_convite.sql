-- Seguranca: so entra ativo quem foi convidado pela tela Equipe (ou o primeiro usuario, o titular).
-- Quem se cadastrar sozinho pela API fica com o acesso desligado, sem ver nenhum dado.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, nome, papel, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    (case when primeiro then 'titular' else 'colaborador' end)::public.papel_t,
    primeiro or new.invited_at is not null
  );
  return new;
end $$;
