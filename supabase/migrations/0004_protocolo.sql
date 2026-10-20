-- Passos Jurídico — protocolo da petição informado na tarefa
-- Quem protocola informa o nº do protocolo/evento; data e hora são as do clique (relógio do servidor).
-- Aparece na tarefa, na linha do tempo do processo e no sino de quem corrigiu/criou.
-- Pode rodar mais de uma vez sem problema.

alter table public.tarefas add column if not exists protocolo_numero text;
alter table public.tarefas add column if not exists protocolo_obs text;

-- carimbo de data e hora do protocolo pelo servidor
create or replace function public.carimba_protocolo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    new.protocolo_avisado_em := now();
    new.protocolo_numero := nullif(trim(coalesce(new.protocolo_numero, '')), '');
    new.protocolo_obs := nullif(trim(coalesce(new.protocolo_obs, '')), '');
  end if;
  return new;
end $$;
drop trigger if exists tarefa_protocolo on public.tarefas;
create trigger tarefa_protocolo before update on public.tarefas
  for each row execute function public.carimba_protocolo();

-- linha do tempo: o evento leva o nº do protocolo, a observação e o horário
create or replace function public.registra_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo_ev text;
  extra jsonb := '{}';
  protocolou boolean := tg_op = 'UPDATE' and new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null;
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
  elsif protocolou then
    tipo_ev := 'protocolo_avisado';
  elsif new.editado_em is distinct from old.editado_em then
    tipo_ev := 'tarefa_editada';
    extra := jsonb_strip_nulls(jsonb_build_object(
      'antes', jsonb_build_object('descricao', old.descricao, 'vencimento', old.vencimento, 'importante', old.importante, 'urgente', old.urgente),
      'depois', jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'importante', new.importante, 'urgente', new.urgente)));
  else
    return new;
  end if;
  if protocolou then
    extra := extra || jsonb_strip_nulls(jsonb_build_object('protocolo', new.protocolo_numero, 'protocolo_obs', new.protocolo_obs, 'protocolo_em', new.protocolo_avisado_em));
  end if;

  insert into public.eventos (processo_numero, caso_id, tarefa_id, publicacao_id, tipo, dados, por)
  values (new.processo_numero, new.caso_id, new.id, new.publicacao_id, tipo_ev,
          jsonb_build_object('descricao', new.descricao, 'vencimento', new.vencimento, 'dias', new.dias,
                             'responsavel', new.responsavel, 'revisor', new.revisor,
                             'importante', new.importante, 'urgente', new.urgente,
                             'protocolo_avisado', protocolou) || extra,
          coalesce(auth.uid(), new.criado_por));
  return new;
end $$;

-- sino: o aviso de protocolo já diz o número
create or replace function public.avisa_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  para_quem uuid;
  tipo_n text;
  txt text;
begin
  if eu is null then return new; end if;
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
    para_quem := coalesce(new.revisor, new.criado_por); tipo_n := 'protocolo';
    txt := 'Protocolado' || coalesce(' (nº ' || new.protocolo_numero || ')', '') || ' em '
           || to_char(new.protocolo_avisado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || ': ' || new.descricao;
  end if;
  if para_quem is not null and para_quem <> eu then
    insert into public.notificacoes (para, de, tipo, texto, processo_numero, caso_id, tarefa_id)
    values (para_quem, eu, tipo_n, txt, new.processo_numero, new.caso_id, new.id);
  end if;
  return new;
end $$;
