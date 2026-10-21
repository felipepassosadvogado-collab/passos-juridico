import { redirect } from "next/navigation";
import { exigirMembro, mapaEquipe } from "@/lib/sessao";
import { Importador } from "./Importador";
import { CompletarDjen } from "./CompletarDjen";

export const metadata = { title: "Importar dados" };

export default async function Importar() {
  const { sb, perfil } = await exigirMembro();
  if (perfil.papel !== "titular") redirect("/");
  const { lista } = await mapaEquipe(sb);
  return (
    <>
      <div className="pg"><div><h1>Importar dados</h1><div className="sub">Traz processos, publicações, clientes, tarefas, atendimentos, avisos e chat do painel antigo</div></div></div>
      <div className="banner">No painel antigo, abra <b>Dados</b> e clique em <b>Exportar para o sistema novo</b>. Envie aqui o arquivo .zip que ele gerar. Pode importar de novo depois: nada se duplica.</div>
      <Importador equipe={lista.filter((m) => m.ativo)} eu={perfil.id} />
      <CompletarDjen />
    </>
  );
}
