import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirMembro } from "@/lib/sessao";
import { FormCliente } from "@/components/FormCliente";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import type { Cliente, Processo } from "@/lib/tipos";

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await exigirMembro();
  const [{ data: c }, { data: ps }] = await Promise.all([
    sb.from("clientes").select("*").eq("id", id).maybeSingle<Cliente>(),
    sb.from("processos").select("numero,mascara,banco,fase,orgao,ultima_data").eq("cliente_id", id).order("ultima_data", { ascending: false }),
  ]);
  if (!c) notFound();
  const procs = (ps || []) as Pick<Processo, "numero" | "mascara" | "banco" | "fase" | "orgao" | "ultima_data">[];
  return (
    <>
      <div className="pg"><div><h1>{nomeBonito(c.nome)}</h1><div className="sub">{procs.length} {procs.length === 1 ? "processo" : "processos"}</div></div>
        <div className="tools"><Link className="btn" href={"/processos/novo?cliente=" + c.id}>Novo processo para este cliente</Link></div></div>
      <FormCliente cliente={c} />
      <section className="panel"><div className="ph"><h3>Processos</h3></div>
        {procs.length ? <table className="grid"><tbody>{procs.map((p) => (
          <tr key={p.numero}><td><span className="pill">{bancoCurto(p.banco)}</span></td>
            <td><Link className="mono" href={"/processos/" + p.numero}>{p.mascara}</Link><div className="s">{p.orgao || ""}</div></td>
            <td>{p.fase ? <span className="pill acc">{p.fase}</span> : <span className="muted">—</span>}</td><td className="mono muted">{dataBR(p.ultima_data)}</td></tr>
        ))}</tbody></table> : <div className="empty">Nenhum processo vinculado.</div>}
      </section>
    </>
  );
}
