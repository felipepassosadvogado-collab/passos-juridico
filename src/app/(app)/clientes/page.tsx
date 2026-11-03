"use client";
import { vincularProcessos } from "@/lib/acoesLote";
import { teclado } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Paginacao, useFiltroUrl, usePaginacao } from "@/components/paginacao";
import { useDados, msgErro } from "@/lib/dados";
import { nomeBonito, semAcento } from "@/lib/formato";
import { soDigitos } from "@/lib/cnj";
import { useJanelas } from "@/components/janelas";

export default function Clientes() {
  const { clientes, processos, tarefas, titular, sb, aplicar, aviso, v } = useDados(); const router = useRouter(); const j = useJanelas();
  const [q, setQ] = useFiltroUrl("q"); const [ocupado, setOcupado] = useState(false); const topo = useRef<HTMLDivElement>(null);
  const { qtd, prz, semCli } = useMemo(() => {
    const qtd: Record<string, number> = {}, prz: Record<string, number> = {}; let semCli = 0;
    for (const p of processos.values()) { if (p.cliente_id) qtd[p.cliente_id] = (qtd[p.cliente_id] || 0) + 1; else semCli++; }
    for (const t of tarefas.values()) if (t.status !== "feito" && t.processo_numero) { const c = processos.get(t.processo_numero)?.cliente_id; if (c) prz[c] = (prz[c] || 0) + 1; }
    return { qtd, prz, semCli };
  }, [processos, tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = useMemo(() => {
    let x = [...clientes.values()];
    if (q) { const n = semAcento(q), d = soDigitos(q); x = x.filter((c) => semAcento(c.nome + " " + (c.cidade || "") + " " + (c.email || "")).includes(n) || (d.length >= 3 && [c.cpf, c.telefone, c.nb].some((y) => soDigitos(y).includes(d)))); }
    return x.sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome)));
  }, [clientes, q, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const pg = usePaginacao("clientes", l.length, q);
  /** liga os processos sem ficha ao cliente de mesmo nome (cria a ficha quando não existe) */
  const vincular = async () => {
    setOcupado(true);
    try {
      // em lote: fichas novas numa gravação só e processos agrupados por ficha (antes: uma ou duas gravações por processo)
      const r = await vincularProcessos(sb, [...processos.values()], [...clientes.values()]);
      for (const c of r.fichasNovas) aplicar("clientes", c);
      for (const p of r.processos) aplicar("processos", p);
      aviso(r.erro ? `${r.ligados} processos ligados; houve um erro em parte deles (${msgErro(r.erro)}).` : r.ligados + " processos ligados a clientes.");
    } finally { setOcupado(false); }
  };
  return (
    <>
      <div className="head"><div><h2>Clientes</h2><div className="sub" aria-live="polite">{q ? `${l.length} de ${clientes.size} com essa busca` : `${clientes.size} clientes`}</div></div>
        <div className="tools"><input type="search" placeholder="Nome, CPF, telefone ou NB" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
          <button className="btn primary" onClick={() => j.novoCliente()}>Novo cliente (com documentos)</button>
          {titular && semCli > 0 && <button className="btn" disabled={ocupado} onClick={vincular}>{ocupado ? "Ligando…" : `Ligar ${semCli} processos sem cliente`}</button>}</div></div>
      {!clientes.size ? <div className="panel"><div className="empty"><strong>Nenhum cliente cadastrado ainda.</strong>Importe os dados do painel antigo ou cadastre o primeiro cliente.</div></div> :
        !l.length ? <div className="panel"><div className="empty"><strong>Nenhum cliente encontrado para “{q}”.</strong>Confira a grafia, ou busque pelo CPF, telefone ou NB.<button className="btn" style={{ marginTop: 8 }} onClick={() => setQ("")}>Limpar a busca</button></div></div> :
        <><div className="panel tscroll" ref={topo} tabIndex={-1} aria-label="Tabela de clientes"><table className="grid"><caption className="sr-only">Clientes{q ? " encontrados" : ""}, página {pg.pagina} de {pg.paginas}. Enter abre a ficha.</caption><thead><tr><th>Cliente</th><th>CPF</th><th>Telefone</th><th>Processos</th><th>Prazos</th></tr></thead>
          <tbody>{l.slice(pg.ini, pg.fim).map((c) => (
            <tr key={c.id} className="click" onClick={() => j.abrirCliente(c.id)} {...teclado(() => j.abrirCliente(c.id))}>
              <td><div style={{ fontWeight: 600 }}>{nomeBonito(c.nome)}</div><div className="s">{[c.cidade, c.nb ? "NB " + c.nb : ""].filter(Boolean).join(" · ")}</div></td>
              <td className="mono">{c.cpf || "—"}</td><td className="mono">{c.telefone || "—"}</td><td>{qtd[c.id] || 0}</td>
              <td>{prz[c.id] ? <span className="pill soon">{prz[c.id]} em aberto</span> : !(c.cpf && c.telefone) ? <span className="pill">ficha incompleta</span> : ""}</td></tr>))}</tbody></table></div>
        <Paginacao p={pg} rotulo="clientes" alvo={topo} /></>}
    </>
  );
}
