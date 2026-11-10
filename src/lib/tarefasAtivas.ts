// Peça aprovada gera a tarefa "Protocolar" (com o prazo escolhido na aprovação). A tarefa de elaboração continua
// "aprovada" até o protocolo, mas não é mais trabalho a fazer: quem vale é a tarefa de protocolo. Sem isto, a agenda e
// os contadores mostravam o protocolo duas vezes, uma delas no vencimento antigo da elaboração (como atrasada).
type T = { id: string; status: string; origem_id?: string | null };

/** ids das tarefas aprovadas que já têm a tarefa de protocolo criada */
export function substituidasPorProtocolo(tarefas: Iterable<T>): Set<string> {
  const lista = [...tarefas]; const origens = new Set(lista.map((t) => t.origem_id).filter(Boolean) as string[]);
  return new Set(lista.filter((t) => t.status === "aprovada" && origens.has(t.id)).map((t) => t.id));
}
