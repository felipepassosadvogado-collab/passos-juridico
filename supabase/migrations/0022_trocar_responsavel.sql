-- Passos Juridico - etapa 0022: quem criou a tarefa (ou o titular) pode trocar o responsavel.
-- O novo responsavel recebe o aviso no sino. Pode rodar mais de uma vez sem problema.

create or replace function public.regras_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then return new; end if;  

  -- trocar o responsavel: quem criou a tarefa ou o titular (fora da correcao)
  if new.responsavel is distinct from old.responsavel and old.responsavel is not null then
    if eu is distinct from old.criado_por and not public.eh_titular() then
      raise exception '%', U&'S\00F3 quem criou a tarefa (ou o titular) pode trocar o respons\00E1vel.';
    end if;
    if old.status = 'revisao' then
      raise exception '%', U&'A tarefa est\00E1 em corre\00E7\00E3o: troque o respons\00E1vel depois da corre\00E7\00E3o.';
    end if;
    if new.responsavel is null then
      raise exception '%', U&'Escolha o novo respons\00E1vel.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('aprovada', 'ajustes') and old.status = 'revisao' then
      if eu is distinct from old.revisor then
        raise exception '%', U&'S\00F3 quem foi escolhido para corrigir pode aprovar ou devolver.';
      end if;
    elsif eu is distinct from old.responsavel then
      raise exception '%', U&'S\00F3 o respons\00E1vel pela tarefa pode mudar a situa\00E7\00E3o dela.';
    end if;
    if new.status = 'revisao' and new.revisor is null then
      raise exception 'Escolha quem vai corrigir.';
    end if;
    if new.status = 'revisao' and new.revisor = old.responsavel and not public.eh_titular() then
      raise exception '%', U&'A corre\00E7\00E3o precisa ser feita por outra pessoa.';
    end if;
    if new.status = 'feito' and old.status = 'revisao' then
      raise exception '%', U&'A tarefa est\00E1 em corre\00E7\00E3o. Aguarde a aprova\00E7\00E3o.';
    end if;
  end if;

  if (new.tipo, new.descricao, new.vencimento, new.dias, new.importante, new.urgente)
     is distinct from (old.tipo, old.descricao, old.vencimento, old.dias, old.importante, old.urgente) then
    if eu is distinct from old.criado_por and not public.eh_titular() then
      raise exception '%', U&'S\00F3 quem criou a tarefa pode edit\00E1-la.';
    end if;
    new.editado_em := now();
    new.editado_por := eu;
  end if;

  -- carimbos de cada passo
  if new.status is distinct from old.status then
    case new.status
      when 'andamento' then new.iniciado_em := coalesce(new.iniciado_em, now());
      when 'revisao'   then new.enviado_em := now();
      when 'ajustes'   then new.devolvido_em := now();
      when 'aprovada'  then new.aprovado_em := now(); new.aprovado_por := eu;
      when 'feito'     then new.feito_em := now(); new.feito_por := eu;
      when 'aberto'    then new.feito_em := null; new.feito_por := null;
    end case;
  end if;

  -- campos que nunca mudam
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  return new;
end $$;

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
      para_quem := new.responsavel; tipo_n := 'tarefa'; txt := U&'Nova tarefa para voc\00EA: ' || new.descricao;
    end if;
  elsif new.responsavel is distinct from old.responsavel and new.responsavel is not null then
    para_quem := new.responsavel; tipo_n := 'tarefa'; txt := U&'Tarefa passada para voc\00EA: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'revisao' then
    para_quem := new.revisor; tipo_n := 'correcao'; txt := U&'Pe\00E7a para corrigir: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'ajustes' then
    para_quem := new.responsavel; tipo_n := 'ajustes'; txt := U&'Pe\00E7a devolvida com ajustes: ' || new.descricao;
  elsif new.status is distinct from old.status and new.status = 'aprovada' then
    para_quem := new.responsavel; tipo_n := 'aprovada'; txt := U&'Pe\00E7a aprovada, pode protocolar: ' || new.descricao;
  elsif new.protocolo_avisado_em is not null and old.protocolo_avisado_em is null then
    para_quem := coalesce(new.revisor, new.criado_por); tipo_n := 'protocolo';
    txt := 'Protocolado' || coalesce(U&' (n\00BA ' || new.protocolo_numero || ')', '') || ' em '
           || to_char(new.protocolo_avisado_em at time zone 'America/Sao_Paulo', U&'DD/MM/YYYY "\00E0s" HH24:MI') || ': ' || new.descricao;
  end if;
  if para_quem is not null and para_quem <> eu then
    insert into public.notificacoes (para, de, tipo, texto, processo_numero, caso_id, tarefa_id)
    values (para_quem, eu, tipo_n, txt, new.processo_numero, new.caso_id, new.id);
  end if;
  return new;
end $$;
