-- Passos Juridico - tipos das tarefas que vieram do ADVBOX (para aparecerem iguais aos da lista de tarefas).
-- Pode rodar mais de uma vez sem problema.
begin;
update public.tarefas set tipo = U&'Recado da equipe' where descricao like U&'Recado da Amanda:%' and tipo is distinct from U&'Recado da equipe';
update public.tarefas set tipo = U&'Recado da equipe' where descricao like U&'Coment\00E1rio%' and tipo is distinct from U&'Recado da equipe';
update public.tarefas set tipo = U&'Conferir protocolo realizado' where descricao like U&'Conferir protocolo realizado%' and tipo is distinct from U&'Conferir protocolo realizado';
update public.tarefas set tipo = U&'Verificar documenta\00E7\00E3o' where descricao like U&'Verificar documenta\00E7\00E3o%' and tipo is distinct from U&'Verificar documenta\00E7\00E3o';
update public.tarefas set tipo = U&'Efetuar pagamento ao cliente' where descricao like U&'Efetuar pagamento%' and tipo is distinct from U&'Efetuar pagamento ao cliente';
update public.tarefas set tipo = U&'Alterar valor da causa e honor\00E1rios' where descricao like U&'Alterar o valor da causa%' and tipo is distinct from U&'Alterar valor da causa e honor\00E1rios';
update public.tarefas set tipo = U&'Elaborar c\00E1lculo de cumprimento (Claude)' where descricao like U&'Elaborar o c\00E1lculo do cumprimento%' and tipo is distinct from U&'Elaborar c\00E1lculo de cumprimento (Claude)';
update public.tarefas set tipo = U&'Elaborar peti\00E7\00E3o de cumprimento (Claude)' where descricao like U&'Elaborar a peti\00E7\00E3o de cumprimento%' and tipo is distinct from U&'Elaborar peti\00E7\00E3o de cumprimento (Claude)';
update public.tarefas set tipo = U&'Verificar tr\00E2nsito em julgado' where descricao like U&'Verificar o tr\00E2nsito%' and tipo is distinct from U&'Verificar tr\00E2nsito em julgado';
update public.tarefas set tipo = U&'Confirmar comparecimento \00E0 audi\00EAncia' where descricao like U&'Confirmar o comparecimento%' and tipo is distinct from U&'Confirmar comparecimento \00E0 audi\00EAncia';
update public.tarefas set tipo = U&'Verificar retorno do cliente' where descricao like U&'Verificar o retorno%' and tipo is distinct from U&'Verificar retorno do cliente';
update public.tarefas set tipo = U&'Enviar mensagem ao cliente (Atende Direito)' where descricao like U&'Enviar mensagem ao cliente%' and tipo is distinct from U&'Enviar mensagem ao cliente (Atende Direito)';
update public.tarefas set tipo = U&'Estudo de caso' where descricao like U&'Estudo de caso%' and tipo is distinct from U&'Estudo de caso';
update public.tarefas set tipo = U&'Transferir pagamento de acordo ao cliente' where descricao like U&'Verificar e transferir%' and tipo is distinct from U&'Transferir pagamento de acordo ao cliente';
update public.tarefas set tipo = U&'Peti\00E7\00E3o de quesitos' where descricao like U&'Peti\00E7\00E3o de quesitos%' and tipo is distinct from U&'Peti\00E7\00E3o de quesitos';
commit;
select tipo, count(*) from public.tarefas group by 1 order by 2 desc;
