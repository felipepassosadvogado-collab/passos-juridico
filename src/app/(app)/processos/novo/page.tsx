import { exigirMembro, mapaEquipe } from "@/lib/sessao";
import { FormNovoProcesso } from "@/components/FormsProcesso";
import { nomeBonito } from "@/lib/formato";

export const metadata = { title: "Novo processo" };

export default async function NovoProcesso({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { sb, perfil } = await exigirMembro();
  const sp = await searchParams;
  const [{ data: cls }, eq] = await Promise.all([sb.from("clientes").select("id,nome").order("nome").limit(5000), mapaEquipe(sb)]);
  return (
    <>
      <div className="pg"><h1>Novo processo</h1></div>
      <FormNovoProcesso eu={perfil.id} clientePadrao={sp.cliente}
        clientes={(cls || []).map((c) => ({ id: c.id, nome: nomeBonito(c.nome) }))}
        equipe={eq.lista.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome }))} />
    </>
  );
}
