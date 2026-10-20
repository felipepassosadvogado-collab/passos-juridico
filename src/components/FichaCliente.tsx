"use client";
// Tela da ficha do cliente (nova ou existente).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { soDigitos } from "@/lib/cnj";
import { faseCRM } from "@/lib/regras";
import type { Cliente } from "@/lib/tipos";
import { CamposCliente, DocumentosSalvos, EnvioDocumentos, useFichaCliente } from "@/components/cliente";
import { useConfirmar } from "@/components/ui";
import { useJanelas } from "@/components/janelas";

export function FichaCliente({ c }: { c?: Cliente }) {
  const { processos, sb, aplicar, remover, aviso, titular } = useDados(); const router = useRouter(); const confirmar = useConfirmar(); const j = useJanelas();
  const f = useFichaCliente(c); const [vinc, setVinc] = useState(""); const [n, setN] = useState(0);
  const ps = c ? [...processos.values()].filter((p) => p.cliente_id === c.id).sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || "")) : [];
  return (
    <>
      <div className="head"><div><h2>{c ? nomeBonito(c.nome) : "Novo cliente"}</h2>{c && <div className="sub">{ps.length} {ps.length === 1 ? "processo" : "processos"}</div>}</div>
        {c && <div className="tools"><Link className="btn" href={"/processos/novo?cliente=" + c.id}>Novo processo para este cliente</Link></div>}</div>
      <section className="panel"><div className="ph"><h3>Documentos</h3><span className="muted" style={{ fontSize: 12 }}>RG ou CNH, comprovante de residência, procuração</span></div>
        {c && <DocumentosSalvos clienteId={c.id} atualizar={n} />}
        <div className="pb"><EnvioDocumentos f={f} texto={c ? "Anexar mais documentos" : "Anexe os documentos e o Claude preenche a ficha"} /></div></section>
      <section className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <CamposCliente f={f} />
        <div className="tools"><button className="btn primary" disabled={f.salvando} onClick={async () => { const id = await f.salvar(); if (id && !c) router.replace("/clientes/" + id); else setN(n + 1); }}>{f.salvando ? "Salvando…" : c ? "Salvar" : "Cadastrar"}</button>
          {c && !ps.length && titular && <button className="btn ghost" onClick={async () => {
            if (!confirmar("del" + c.id, aviso, "Clique de novo em “Excluir ficha” para confirmar.")) return;
            const { error } = await sb.from("clientes").delete().eq("id", c.id); if (error) { aviso(msgErro(error)); return; } remover("clientes", c.id); aviso("Ficha excluída."); router.replace("/clientes");
          }}>Excluir ficha</button>}</div></div></section>
      {c && <section className="panel"><div className="ph"><h3>Processos</h3></div>
        {ps.length ? <div className="rows">{ps.map((p) => (
          <div key={p.numero} className="row click" onClick={() => j.abrirProcesso(p.numero)}><span className="pill">{bancoCurto(p.banco)}</span>
            <div className="main"><div className="t mono">{p.mascara}</div><div className="s">{(faseCRM(p.fase) || "Sem fase") + " · " + (p.orgao || "")}</div></div><span className="mono muted">{dataBR(p.ultima_data)}</span></div>))}</div>
          : <div className="empty">Nenhum processo vinculado.</div>}
        <div className="tools" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
          <input value={vinc} placeholder="Nº do processo para vincular" onChange={(e) => setVinc(e.target.value)} />
          <button className="btn" onClick={async () => { const num = soDigitos(vinc); if (!processos.has(num)) { aviso("Processo não encontrado na carteira."); return; }
            const { data, error } = await sb.from("processos").update({ cliente_id: c.id, cliente_nome: processos.get(num)!.cliente_nome || c.nome }).eq("numero", num).select().single();
            if (error) aviso(msgErro(error)); else { aplicar("processos", data); setVinc(""); aviso("Processo vinculado."); } }}>Vincular</button></div>
      </section>}
    </>
  );
}

