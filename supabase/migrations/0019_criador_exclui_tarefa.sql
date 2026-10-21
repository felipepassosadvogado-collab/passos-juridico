-- Quem criou a tarefa tambem pode exclui-la (antes so o titular).
drop policy if exists criador_exclui on public.tarefas;
create policy criador_exclui on public.tarefas for delete to authenticated
  using (public.membro_ativo() and criado_por = auth.uid());
