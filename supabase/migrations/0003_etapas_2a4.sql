-- Passos Jurídico — etapas 2 a 4
-- Recado da correção nas tarefas, avisos internos automáticos, exclusão registrada
-- na linha do tempo e atualização em tempo real de todas as telas.
-- Pode rodar mais de uma vez sem problema.

-- ───────────── recado de quem envia ou devolve a peça para correção ─────────────
alter table public.tarefas add column if not exists nota_correcao text;

-- ───────────── linha do tempo das tarefas (agora com o recado da correção) ─────────────
create or replace function public.registra_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo_ev text;
  extra jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    tipo_ev := 'tarefa_criada';
  elsif new.status is distinct from old.status then
    tipo_ev := case new.status
      when 'andamento' then 'tarefa_iniciada'
      when 'revisao'   then 'correcao_enviada'
      when 'ajustes'   then 'correcao_devolvida'
      when 'aprovada'  then 'correcao_aprovada'
      when 'feito'     then 'tarefa_concluida'
      when 'aberto'    then 'tarefa_reaberta' end;
    if new.status in ('revisao', 'ajustes') and coalesce(new.nota_correcao, '') <> '' then
      extra := jsonb_build_object('nota', new.nota_correcao);
    end if;
  elsif new.responsavel is distinct from old.responsavel then
    tipo_ev := 'tarefa_atribuida';
  elsif new.protocolo_avisado_em is distinct from old.protocolo_avisado_em and new.protocolo_avisado_em is not null then
    tipo_ev := 'protocolo_avisado';
  elsif new.editado_em is distinct from old.editado_em then
    tipo_ev := 'tarefa_editada';
    extra := jsonb_strip_nulls(jsonb_build_object(
      'antes', jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'importante', old.importante, 'urgente', old.urgente),
      'depois', jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'importante', new.importante, 'urgente', new.urgente)));
  else
    return new;
  end if;

  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (new.processo_numero, new.caso_id, new.id, new.publicacao_id, tipo_ev,
          jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'dias', new.dias,
                             'responsavel', new.responsavel, 'revisor', new.revisor,
                             'importante', new.importante, 'urgente', new.urgente,
                             'protocolo_avisado', tg_op = 'UPDATE' and new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null) || extra,
          coalesce(auth.uid(), new.criado_por));
  return new;
end $$;

-- ───────────── avisos internos (sino) gerados pelo próprio banco ─────────────
-- tarefa nova para outra pessoa, peça enviada para correção, devolvida, aprovada e protocolo avisado
create or replace function public.avisa_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  para_quem uuid;
  tipo_n text;
  txt text;
begin
  if eu is null then return new; end if;   -- importação e rotinas do servidor não avisam ninguém
  if tg_op = 'INSERT' then
    if new.responsavel is not null and new.responsavel <> eu then
      para_quem := new.responsavel; tipo_n := 'tarefa'; txt := 'Nova tarefa para você: ' || new.descricao;
    end if;
  elsif new.status is distinct from old.status and new.status = 'revisao' then
    para_quem := new.revisor; tipo_n := 'correcao'; txt := 'Peça para corrigir: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'ajustes' then
    para_quem := new.responsavel; tipo_n := 'ajustes'; txt := 'Peça devolvida com ajustes: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'aprovada' then
    para_quem := new.responsavel; tipo_n := 'aprovada'; txt := 'Peça aprovada, pode protocolar: ' || new.descricao;
  elsif new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    para_quem := coalesce(new.revisor, new.criado_por); tipo_n := 'protocolo'; txt := 'Protocolo realizado: ' || new.descricao;
  end if;
  if para_quem is not null and para_quem <> eu then
    insert into public.notificacoes (para, de, tipo, texto, processo_numero, caso_id, tarefa_id)
    values (para_quem, eu, tipo_n, txt, new.processo_numero, new.caso_id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists tarefa_avisos on public.tarefas;
create trigger tarefa_avisos after insert or update on public.tarefas
  for each row execute function public.avisa_tarefa();

-- ───────────── tarefa excluída fica registrada na linha do tempo ─────────────
create or replace function public.registra_exclusao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- tarefa apagada junto com o processo ou o atendimento: não há onde registrar
  if (old.processo_numero is not null and not exists (select 1 from public.processos where numero = old.processo_numero))
     or (old.processo_numero is null and old.caso_id is not null and not exists (select 1 from public.casos where id = old.caso_id)) then
    return old;
  end if;
  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (old.processo_numero, old.caso_id, null, old.publicacao_id, 'tarefa_excluida',
          jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'responsavel', old.responsavel),
          coalesce(auth.uid(), old.criado_por));
  return old;
end $$;

drop trigger if exists tarefa_excluida on public.tarefas;
create trigger tarefa_excluida before delete on public.tarefas
  for each row execute function public.registra_exclusao();

-- ───────────── arquivos: permitir substituir um arquivo enviado de novo ─────────────
drop policy if exists "membros atualizam documentos" on storage.objects;
create policy "membros atualizam documentos" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.membro_ativo()) with check (bucket_id = 'documentos' and public.membro_ativo());

-- ───────────── tempo real em todas as telas ─────────────
do $$
declare t text;
begin
  foreach t in array array['processos', 'clientes', 'publicacoes', 'casos', 'tarefas', 'documentos', 'avisos_cliente',
                           'notificacoes', 'mensagens', 'mensagens_lidas', 'eventos', 'config', 'profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────── configuração inicial ─────────────
insert into public.config (chave, valor) values ('djen', '{}'), ('geral', '{}') on conflict (chave) do nothing;

select 'Etapas 2 a 4 instaladas: ok' as resultado;
