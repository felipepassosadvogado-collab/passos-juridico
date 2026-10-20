import Link from "next/link";
import { exigirMembro } from "@/lib/sessao";
import { mascaraCpf, nomeBonito } from "@/lib/formato";
import type { Cliente } from "@/lib/tipos";

export const metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { sb } = await exigirMembro();
  const sp = await searchParams; const q = (sp.q || "").trim(); const pag = Math.max(1, +(sp.p || 1)); const por = 50;
  let consulta = sb.from("clientes").select("id,nome,cpf,telefone,cidade,nb", { count: "exact" }).order("nome").range((pag - 1) * por, pag * por - 1);
  if (q) {
    const d = q.replace(/\D/g, "");
    consulta = d.length >= 3 && d.length === q.replace(/[\s.\-()/]/g, "").length
      ? consulta.or(`cpf.ilike.${mascaraCpf(d)}%,telefone.ilike.%${d}%,nb.ilike.%${d}%`)
      : consulta.ilike("nome", `%${q.replace(/[%,()]/g, " ")}%`);
  }
  const { data, count } = await consulta;
  const lista = (data || []) as Pick<Cliente, "id" | "nome" | "cpf" | "telefone" | "cidade" | "nb">[];
  const total = count || 0;
  return (
    <>
      <div className="pg"><div><h1>Clientes</h1><div className="sub">{total} cadastrados</div></div>
        <div className="tools"><form><input name="q" defaultValue={q} placeholder="Nome, CPF, telefone ou NB" aria-label="Buscar cliente" /></form>
          <Link className="btn primary" href="/clientes/novo">Novo cliente</Link></div></div>
      <section className="panel tscroll">
        {lista.length ? <table className="grid"><thead><tr><th>Cliente</th><th>CPF</th><th>Telefone</th><th>Cidade</th></tr></thead><tbody>
          {lista.map((c) => <tr key={c.id}><td className="forte"><Link href={"/clientes/" + c.id} style={{ color: "inherit" }}>{nomeBonito(c.nome)}</Link>{c.nb && <div className="s">NB {c.nb}</div>}</td>
            <td className="mono">{c.cpf || "—"}</td><td className="mono">{c.telefone || "—"}</td><td>{c.cidade || "—"}</td></tr>)}
        </tbody></table> : <div className="empty"><strong>Nenhum cliente encontrado.</strong>{q ? "Tente outra busca." : "Cadastre o primeiro ou importe os dados do painel antigo."}</div>}
      </section>
      {total > por && <div className="tools">
        {pag > 1 && <Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${pag - 1}`}>‹ Anterior</Link>}
        <span className="muted">Página {pag} de {Math.ceil(total / por)}</span>
        {pag * por < total && <Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${pag + 1}`}>Próxima ›</Link>}
      </div>}
    </>
  );
}
