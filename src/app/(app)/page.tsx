import Link from "next/link";
import { exigirMembro } from "@/lib/sessao";
import { hojeBR } from "@/lib/prazos";

export default async function Painel() {
  const { sb, perfil } = await exigirMembro();
  const hoje = hojeBR();
  const [pubs, minhas, vencidas, procs, clis] = await Promise.all([
    sb.from("publicacoes").select("id", { count: "exact", head: true }).eq("triagem", "pendente"),
    sb.from("tarefas").select("id", { count: "exact", head: true }).eq("responsavel", perfil.id).neq("status", "feito"),
    sb.from("tarefas").select("id", { count: "exact", head: true }).eq("responsavel", perfil.id).neq("status", "feito").lt("vencimento", hoje),
    sb.from("processos").select("numero", { count: "exact", head: true }),
    sb.from("clientes").select("id", { count: "exact", head: true }),
  ]);
  const dia = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <div className="pg"><div><h1>Painel</h1><div className="sub" style={{ textTransform: "capitalize" }}>{dia}</div></div></div>
      <div className="stats">
        <div className="stat"><span className="n">{pubs.count ?? 0}</span><span className="l">publicações para triar</span></div>
        <div className="stat"><span className="n">{minhas.count ?? 0}</span><span className="l">tarefas suas em aberto</span></div>
        <div className={"stat" + ((vencidas.count ?? 0) > 0 ? " late" : "")}><span className="n">{vencidas.count ?? 0}</span><span className="l">tarefas suas vencidas</span></div>
        <Link className="stat" href="/processos"><span className="n">{procs.count ?? 0}</span><span className="l">processos</span></Link>
        <Link className="stat" href="/clientes"><span className="n">{clis.count ?? 0}</span><span className="l">clientes</span></Link>
      </div>
      {(procs.count ?? 0) === 0 && perfil.papel === "titular" && (
        <div className="banner">O sistema está vazio. Vá em <Link href="/importar">Importar dados</Link> para trazer os processos, clientes e tarefas do painel antigo.</div>
      )}
    </>
  );
}
