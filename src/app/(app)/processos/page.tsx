import Link from "next/link";
import { exigirMembro } from "@/lib/sessao";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { FASES, type Processo } from "@/lib/tipos";
import { soDigitos } from "@/lib/cnj";

export const metadata = { title: "Processos" };

export default async function Processos({ searchParams }: { searchParams: Promise<{ q?: string; fase?: string; p?: string }> }) {
  const { sb } = await exigirMembro();
  const sp = await searchParams; const q = (sp.q || "").trim(); const fase = sp.fase || ""; const pag = Math.max(1, +(sp.p || 1)); const por = 60;
  let c = sb.from("processos").select("numero,mascara,cliente_nome,banco,orgao,fase,ultima_data,ultimo_ato", { count: "exact" })
    .order("ultima_data", { ascending: false, nullsFirst: false }).range((pag - 1) * por, pag * por - 1);
  if (q) { const d = soDigitos(q); c = d.length >= 4 && d.length === q.replace(/[\s.\-]/g, "").length ? c.like("numero", `%${d}%`) : c.ilike("cliente_nome", `%${q.replace(/[%,()]/g, " ")}%`); }
  if (fase === "sem") c = c.is("fase", null); else if (fase) c = c.eq("fase", fase);
  const { data, count } = await c;
  const lista = (data || []) as Processo[]; const total = count || 0;
  const qs = (p: number) => `?q=${encodeURIComponent(q)}&fase=${encodeURIComponent(fase)}&p=${p}`;
  return (
    <>
      <div className="pg"><div><h1>Processos</h1><div className="sub">{total} {fase ? "nesta fase" : "no total"}</div></div>
        <div className="tools">
          <form className="tools"><input name="q" defaultValue={q} placeholder="Cliente ou nº do processo" aria-label="Buscar processo" />
            <select name="fase" defaultValue={fase} aria-label="Fase"><option value="">Todas as fases</option><option value="sem">Sem fase definida</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select>
            <button className="btn">Filtrar</button></form>
          <Link className="btn primary" href="/processos/novo">Novo processo</Link></div></div>
      <section className="panel tscroll">
        {lista.length ? <table className="grid"><thead><tr><th>Cliente</th><th>Réu</th><th>Processo</th><th>Fase</th><th>Último ato</th></tr></thead><tbody>
          {lista.map((p) => <tr key={p.numero}>
            <td className="forte"><Link href={"/processos/" + p.numero} style={{ color: "inherit" }}>{nomeBonito(p.cliente_nome) || "—"}</Link><div className="s">{p.orgao || ""}</div></td>
            <td>{bancoCurto(p.banco)}</td><td className="mono">{p.mascara}</td>
            <td>{p.fase ? <span className="pill acc">{p.fase}</span> : <span className="muted">—</span>}</td>
            <td>{p.ultimo_ato || "—"}<div className="s mono">{dataBR(p.ultima_data)}</div></td></tr>)}
        </tbody></table> : <div className="empty"><strong>Nenhum processo encontrado.</strong>{q || fase ? "Tente outra busca." : "Importe os dados do painel antigo ou cadastre um processo."}</div>}
      </section>
      {total > por && <div className="tools">
        {pag > 1 && <Link className="btn" href={qs(pag - 1)}>‹ Anterior</Link>}
        <span className="muted">Página {pag} de {Math.ceil(total / por)}</span>
        {pag * por < total && <Link className="btn" href={qs(pag + 1)}>Próxima ›</Link>}</div>}
    </>
  );
}
