-- Reaplica as funções que têm mensagens com acento (pode rodar quantas vezes quiser).

create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.eh_titular()
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo) then
    raise exception 'Só o titular altera o papel ou o acesso de um membro.';
  end if;
  if auth.uid() is not null and not public.eh_titular() and new.id <> auth.uid() then
    raise exception 'Você só pode alterar o seu próprio perfil.';
  end if;
  return new;
end $$;

create or replace function public.regras_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then return new; end if;   -- importação e rotinas do servidor

  if new.responsavel is distinct from old.responsavel and old.responsavel is not null then
    raise exception 'O responsável da tarefa é definido na criação e não pode ser trocado.';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('aprovada', 'ajustes') and old.status = 'revisao' then
      if eu is distinct from old.revisor then
        raise exception 'Só quem foi escolhido para corrigir pode aprovar ou devolver.';
      end if;
    elsif eu is distinct from old.responsavel then
      raise exception 'Só o responsável pela tarefa pode mudar a situação dela.';
    end if;
    if new.status = 'revisao' and new.revisor is null then
      raise exception 'Escolha quem vai corrigir.';
    end if;
    if new.status = 'revisao' and new.revisor = old.responsavel then
      raise exception 'A correção precisa ser feita por outra pessoa.';
    end if;
    if new.status = 'feito' and old.status = 'revisao' then
      raise exception 'A tarefa está em correção. Aguarde a aprovação.';
    end if;
  end if;

  if (new.tipo, new.descricao, new.vencimento, new.dias, new.importante, new.urgente)
     is distinct from (old.tipo, old.descricao, old.vencimento, old.dias, old.importante, old.urgente) then
    if eu is distinct from old.criado_por and not public.eh_titular() then
      raise exception 'Só quem criou a tarefa pode editá-la.';
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

select 'Textos corrigidos: ' || (case when position('Só o titular' in pg_get_functiondef('public.protege_perfil'::regproc))>0 then 'ok' else 'ainda com problema' end) as resultado;
