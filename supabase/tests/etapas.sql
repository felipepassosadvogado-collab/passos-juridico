\set ON_ERROR_STOP 0
-- testes da migração 0003: avisos internos, recado da correção, exclusão registrada
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','felipe@x.com','{"nome":"Felipe dos Passos Silva"}'),
 ('22222222-2222-2222-2222-222222222222','amanda@x.com','{"nome":"Amanda Fukuhara"}');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.processos (numero, cliente_nome) values ('50157251220264047201','MARIA DA SILVA');
insert into public.tarefas (id, processo_numero, descricao, vencimento, responsavel)
  values ('bbbbbbbb-0000-0000-0000-000000000001','50157251220264047201','Réplica','2026-10-30','22222222-2222-2222-2222-222222222222');
\echo '--- Amanda recebe aviso de tarefa nova'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select tipo, texto from public.notificacoes;
\echo '--- Amanda envia para correção com recado'
update public.tarefas set status='revisao', revisor='11111111-1111-1111-1111-111111111111', nota_correcao='confira o pedido de perícia' where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select tipo, texto from public.notificacoes;
select tipo, dados->>'nota' nota from public.eventos where tipo='correcao_enviada';
\echo '--- Felipe devolve com ajustes'
update public.tarefas set status='ajustes', nota_correcao='faltou o quesito 3' where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select tipo, texto from public.notificacoes order by em;
\echo '--- Amanda reenvia, Felipe aprova, Amanda protocola e conclui'
update public.tarefas set status='revisao', nota_correcao=null where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.tarefas set status='aprovada' where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.tarefas set status='feito', protocolo_avisado_em=now() where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select tipo, texto from public.notificacoes order by em;
\echo '--- Felipe (titular) exclui a tarefa: fica na linha do tempo'
delete from public.tarefas where id='bbbbbbbb-0000-0000-0000-000000000001';
select tipo, dados->>'descricao' from public.eventos where tipo='tarefa_excluida';
\echo '--- excluir o processo inteiro (com tarefa) não dá erro'
insert into public.tarefas (processo_numero, descricao, vencimento, responsavel) values ('50157251220264047201','Outra','2026-11-30','11111111-1111-1111-1111-111111111111');
reset role;
delete from public.processos where numero='50157251220264047201';
select count(*) processos, (select count(*) from public.tarefas) tarefas, (select count(*) from public.eventos) eventos from public.processos;
\echo '--- tabelas em tempo real'
select string_agg(tablename, ', ' order by tablename) from pg_publication_tables where pubname='supabase_realtime';
\echo '--- rodar a migração de novo não dá erro'
