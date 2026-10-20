\set ON_ERROR_STOP 0
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- usuários
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','felipe@x.com','{"nome":"Felipe dos Passos Silva"}'),
 ('22222222-2222-2222-2222-222222222222','amanda@x.com','{"nome":"Amanda Fukuhara"}'),
 ('33333333-3333-3333-3333-333333333333','terceiro@x.com','{}');
select nome, papel from public.profiles order by nome;

set role authenticated;
-- Amanda tenta se promover
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.profiles set papel='titular' where id=auth.uid();
-- Felipe cria cliente, processo e tarefa para a Amanda
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.clientes (id,nome,cpf) values ('aaaaaaaa-0000-0000-0000-000000000001','Maria da Silva','529.982.247-25');
insert into public.processos (numero, cliente_id, cliente_nome) values ('50157251220264047201','aaaaaaaa-0000-0000-0000-000000000001','MARIA DA SILVA');
select mascara from public.processos;
insert into public.tarefas (id, processo_numero, descricao, vencimento, responsavel)
  values ('bbbbbbbb-0000-0000-0000-000000000001','50157251220264047201','Réplica com pedido de perícia','2026-10-30','22222222-2222-2222-2222-222222222222');
\echo '--- Felipe tenta trocar o responsável (deve falhar)'
update public.tarefas set responsavel='11111111-1111-1111-1111-111111111111' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Felipe tenta concluir a tarefa da Amanda (deve falhar)'
update public.tarefas set status='feito' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Amanda edita a descrição criada pelo Felipe (deve falhar)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.tarefas set descricao='outra' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Amanda envia para correção do Felipe (ok)'
update public.tarefas set status='revisao', revisor='11111111-1111-1111-1111-111111111111' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Amanda tenta aprovar a própria peça (deve falhar)'
update public.tarefas set status='aprovada' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Amanda tenta concluir em correção (deve falhar)'
update public.tarefas set status='feito' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Felipe aprova (ok)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.tarefas set status='aprovada' where id='bbbbbbbb-0000-0000-0000-000000000001';
\echo '--- Amanda conclui (ok)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.tarefas set status='feito', protocolo_avisado_em=now() where id='bbbbbbbb-0000-0000-0000-000000000001';
select status, feito_por = '22222222-2222-2222-2222-222222222222' as feito_pela_amanda, aprovado_por is not null as aprovado from public.tarefas;
\echo '--- Amanda tenta excluir (não apaga nada)'
delete from public.tarefas where id='bbbbbbbb-0000-0000-0000-000000000001';
select count(*) as tarefas_restantes from public.tarefas;
\echo '--- linha do tempo'
select tipo, (select nome from public.profiles where id=por) quem from public.eventos order by id;
\echo '--- tentar apagar a linha do tempo (não apaga)'
delete from public.eventos; select count(*) eventos from public.eventos;
\echo '--- chat: conversa direta Felipe e Amanda'
insert into public.mensagens (conversa, texto) values ('dm:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222','oi Felipe');
insert into public.mensagens (conversa, texto) values ('geral','bom dia equipe');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select conversa from public.mensagens order by conversa;  -- só a geral
\echo '--- terceiro tenta escrever na conversa dos dois (deve falhar)'
insert into public.mensagens (conversa, texto) values ('dm:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222','intruso');
\echo '--- membro desativado não lê nada'
reset role; reset request.jwt.claim.sub;
update public.profiles set ativo=false where id='33333333-3333-3333-3333-333333333333';
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) clientes_visiveis from public.clientes;
