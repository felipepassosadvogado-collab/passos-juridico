-- Passos Juridico - o titular pode corrigir a propria tarefa
-- (para conferir como a correcao aparece para quem corrige). Os demais continuam
-- precisando de outra pessoa para corrigir.
-- Pode rodar mais de uma vez sem problema.

create or replace function public.regras_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then return new; end if;  

  if new.responsavel is distinct from old.responsavel and old.responsavel is not null then
    raise exception '%', U&'O respons\00E1vel da tarefa \00E9 definido na cria\00E7\00E3o e n\00E3o pode ser trocado.';
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
