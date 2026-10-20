"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useDados } from "@/lib/dados";
import { nomeBonito, semAcento } from "@/lib/formato";
import { soDigitos } from "@/lib/cnj";
import { useJanelas } from "@/components/janelas";

export default function Clientes() {
  const { clientes, processos, tarefas, titular, sb, aplicar, aviso, v } = useDados(); const router = useRouter(); const j = useJanelas();
  const [q, setQ] = useState(""); const [ocupado, setOcupado] = useState(false);
  const { qtd, prz, semCli } = useMemo(() => {
    const qtd: Record<string, number> = {}, prz: Record<string, number> = {}; let semCli = 0;
    for (const p of processos.values()) { if (p.cliente_id) qtd[p.cliente_id] = (qtd[p.cliente_id] || 0) + 1; else semCli++; }
    for (const t of tarefas.values()) if (t.status !== "feito" && t.processo_numero) { const c = processos.get(t.processo_numero)?.cliente_id; if (c) prz[c] = (prz[c] || 0) + 1; }
    return { qtd, prz, semCli };
  }, [processos, tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  let l = [...clientes.values()];
  if (q) { const n = semAcento(q), d = soDigitos(q); l = l.filter((c) => semAcento(c.nome + " " + (c.cidade || "") + " " + (c.email || "")).includes(n) || (d.length >= 3 && [c.cpf, c.telefone, c.nb].some((x) => soDigitos(x).includes(d)))); }
  l.sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome)));
  /** liga os processos sem ficha ao cliente de mesmo nome (cria a ficha quando não existe) */
  const vincular = async () => {
    setOcupado(true); let ok = 0;
    const porNome = new Map([...clientes.values()].map((c) => [semAcento(c.nome), c.id]));
    try {
      for (const p of processos.values()) {
        if (p.cliente_id) continue; const nome = (p.cliente_nome || "").split(" / ")[0].trim();
        if (!nome || /\bbanco\b|s\.?a\.?$|ltda|instituto nacional|sigilo/i.test(nome)) continue;
        let id = porNome.get(semAcento(nome));
        if (!id) { const { data } = await sb.from("clientes").insert({ nome: nomeBonito(nome) }).select().single(); if (!data) continue; aplicar("clientes", data); id = data.id; porNome.set(semAcento(nome), id!); }
        const { data } = await sb.from("processos").update({ cliente_id: id }).eq("numero", p.numero).select().single(); if (data) { aplicar("processos", data); ok++; }
      }
      aviso(ok + " processos ligados a clientes.");
    } finally { setOcupado(false); }
  };
  return (
    <>
      <div className="head"><div><h2>Clientes</h2><div className="sub">{l.length} de {clientes.size}</div></div>
        <div className="tools"><input type="search" placeholder="Nome, CPF, telefone ou NB" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
          <button className="btn primary" onClick={() => j.novoCliente()}>Novo cliente (com documentos)</button>
          {titular && semCli > 0 && <button className="btn" disabled={ocupado} onClick={vincular}>{ocupado ? "Ligando…" : `Ligar ${semCli} processos sem cliente`}</button>}</div></div>
      {!clientes.size ? <div className="panel"><div className="empty"><strong>Nenhum cliente cadastrado ainda.</strong>Importe os dados do painel antigo ou cadastre o primeiro cliente.</div></div> :
        <div className="panel tscroll"><table className="grid"><thead><tr><th>Cliente</th><th>CPF</th><th>Telefone</th><th>Processos</th><th>Prazos</th></tr></thead>
          <tbody>{l.slice(0, 500).map((c) => (
            <tr key={c.id} className="click" onClick={() => router.push("/clientes/" + c.id)}>
              <td><div style={{ fontWeight: 600 }}>{nomeBonito(c.nome)}</div><div className="s">{[c.cidade, c.nb ? "NB " + c.nb : ""].filter(Boolean).join(" · ")}</div></td>
              <td className="mono">{c.cpf || "—"}</td><td className="mono">{c.telefone || "—"}</td><td>{qtd[c.id] || 0}</td>
              <td>{prz[c.id] ? <span className="pill soon">{prz[c.id]} em aberto</span> : !(c.cpf && c.telefone) ? <span className="pill">ficha incompleta</span> : ""}</td></tr>))}</tbody></table></div>}
      {l.length > 500 && <div className="muted">Mostrando 500. Use a busca para encontrar os demais.</div>}
    </>
  );
}
