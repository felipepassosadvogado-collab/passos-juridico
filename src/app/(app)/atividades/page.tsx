import { redirect } from "next/navigation";
// "Atividades" virou a visão Lista da Agenda
export default async function Atividades({ searchParams }: { searchParams: Promise<{ tarefa?: string }> }) {
  const { tarefa } = await searchParams;
  redirect("/agenda?modo=lista" + (tarefa ? "&tarefa=" + encodeURIComponent(tarefa) : ""));
}
