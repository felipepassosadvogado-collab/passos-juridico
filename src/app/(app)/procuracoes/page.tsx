"use client";
// Procurações sem processo (só o titular): o Claude lê os documentos guardados nas fichas (procuração, kit, escaneados)
// e anota contra quais bancos o cliente deu poderes; a lista mostra os bancos que não viraram processo.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, nomeBonito } from "@/lib/formato";
import { cruzarProcuracoes, type Lida, type Pendencia } from "@/lib/procuracoes";
import { useJanelas } from "@/components/janelas";
import { useVisor } from "@/components/visor";

type Contagem = { candidatos: number; lidos: number; faltam: number };

export default function Procuracoes() {
  const { sb, titular, clientes, processos, casos, aviso } = useDados(); const j = useJanelas(); const visor = useVisor();
  const [cont, setCont] = useState<Contagem | null>(null); const [erro, setErro] = useState("");
  const [lidas, setLidas] = useState<Lida[] | null>(null);
  const [lendo, setLendo] = useState<{ feitos: number; total: number; achadas: number } | null>(null); const parar = useRef(false);
  const [filtro, setFiltro] = useState<"" | "itau" | "outros" | "atend">("");

  const contar = async () => {
    const r = await fetch("/api/claude/procuracoes"); const x = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(x.erro || "Não consegui contar os documentos."); return null; }
    setErro(""); setCont(x); return x as Contagem;
  };
  const carregar = async () => {
    const out: Lida[] = [];
    for (let de = 0; ; de += 1000) {
      const r = await sb.from("procuracoes_lidas").select("*, doc:documentos(nome,caminho,mime,tipo,em)").range(de, de + 999);
      if (r.error) { setErro(/procuracoes_lidas|schema cache|does not exist/i.test(r.error.message) ? "Falta rodar a etapa 0031 (0031_procuracoes_lidas.sql) no Supabase para esta análise funcionar." : msgErro(r.error)); return; }
      out.push(...((r.data || []) as Lida[])); if ((r.data || []).length < 1000) break;
    }
    setLidas(out);
  };
  useEffect(() => { if (titular) { contar(); carregar(); } }, [titular]); // eslint-disable-line react-hooks/exhaustive-deps

  const ler = async () => {
    const c = await contar(); if (!c?.faltam) { aviso("Não há documentos novos para ler."); return; }
    parar.current = false; let feitos = 0, achadas = 0, falhas = 0; setLendo({ feitos, total: c.faltam, achadas });
    try {
      while (!parar.current) {
        const r = await fetch("/api/claude/procuracoes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: "ler" }) });
        const x = JSON.parse((await r.text()).trim() || "{}");
        if (!r.ok || x.erro) { if (++falhas >= 3) { aviso("Parei a leitura: " + (x.erro || "erro no servidor") + ". Clique de novo para continuar de onde parou."); break; } continue; }
        falhas = 0; feitos += x.lidos || 0; achadas += x.procuracoes || 0; setLendo({ feitos, total: c.faltam, achadas });
        if (!x.lidos || !x.faltam) break;
        if (feitos % 30 < 6) await carregar(); // a lista vai aparecendo enquanto lê
      }
    } catch (e) { aviso(msgErro(e, (e as Error).message)); }
    finally { setLendo(null); await Promise.all([contar(), carregar()]); }
  };

  const pend = useMemo(() => lidas ? cruzarProcuracoes(lidas, [...clientes.values()], [...processos.values()], [...casos.values()]) : [], [lidas, clientes, processos, casos]);
  const vis = pend.filter((p) => !filtro || (filtro === "itau" ? p.chave === "ITAU" : filtro === "outros" ? p.chave !== "ITAU" && p.chave !== "C6" : p.situacao === "so_atendimento"));
  const comErro = (lidas || []).filter((l) => l.erro);
  const nProc = (lidas || []).filter((l) => l.eh_procuracao).length;

  const conferir = async (p: Pendencia) => {
    for (const l of p.procuracoes) {
      const conferidos = [...new Set([...(l.conferidos || []), p.chave])];
      const r = await sb.from("procuracoes_lidas").update({ conferidos }).eq("documento_id", l.documento_id);
      if (r.error) { aviso(msgErro(r.error)); return; }
    }
    setLidas((v) => (v || []).map((l) => p.procuracoes.some((x) => x.documento_id === l.documento_id) ? { ...l, conferidos: [...new Set([...(l.conferidos || []), p.chave])] } : l));
    aviso(`${nomeBonito(p.cliente)} × ${p.banco}: marcado como conferido; sai da lista.`);
  };
  const tentarDeNovo = async () => {
    const r = await sb.from("procuracoes_lidas").delete().in("documento_id", comErro.map((l) => l.documento_id));
    if (r.error) { aviso(msgErro(r.error)); return; }
    await Promise.all([contar(), carregar()]); aviso("Os documentos com erro voltaram para a fila. Clique em “Ler os documentos”.");
  };

  if (!titular) return <div className="page"><div className="empty">Esta análise é só do titular.</div></div>;
  const custo = cont ? Math.max(1, Math.round(cont.faltam * 0.15)) : 0;
  return (
    <div className="page">
      <div className="head"><div><h1>Procurações sem processo</h1><div className="sub">o Claude lê as procurações guardadas nas fichas e mostra os bancos que ficaram sem ação (ex.: veio procuração do C6 e do Itaú 029, entrou só a do C6)</div></div></div>
      {erro && <div className="banner erro" role="alert">{erro}</div>}

      <div className="prc-caixa prc-ler">
        <div>
          <strong>Documentos guardados</strong>
          <div className="muted s">{cont ? <>{cont.candidatos} podem ser procuração (procurações, kits, escaneados e “outros” das fichas; RG, comprovante, extratos e peças ficam de fora) · <b>{cont.lidos}</b> já lidos · <b>{cont.faltam}</b> para ler</> : "contando…"}</div>
          {lendo && <div className="prc-barra" aria-live="polite"><div style={{ width: Math.min(100, (lendo.feitos / Math.max(1, lendo.total)) * 100) + "%" }} /><span>Lendo {lendo.feitos} de {lendo.total} · {lendo.achadas} procuração(ões) encontrada(s)</span></div>}
        </div>
        <div className="tools">
          {lendo ? <button className="btn" onClick={() => { parar.current = true; }}>Parar (continua depois de onde parou)</button>
            : <button className="btn primary" disabled={!cont?.faltam} onClick={ler} title={cont?.faltam ? `Cada documento é lido uma vez só. Custo estimado: até R$ ${custo} no Claude.` : "Tudo já foi lido"}>{cont?.faltam ? `Ler os ${cont.faltam} documentos (≈ R$ ${custo})` : "Tudo lido"}</button>}
        </div>
      </div>

      {lidas && <>
        <div className="prc-resumo">
          <span className="chip">{nProc} procuração(ões) encontrada(s)</span>
          <button className={"chip" + (filtro === "" ? " on" : "")} onClick={() => setFiltro("")}><b>{pend.length}</b> banco(s) sem processo</button>
          <button className={"chip" + (filtro === "itau" ? " on" : "")} onClick={() => setFiltro(filtro === "itau" ? "" : "itau")}>Itaú (029): <b>{pend.filter((p) => p.chave === "ITAU").length}</b></button>
          <button className={"chip" + (filtro === "outros" ? " on" : "")} onClick={() => setFiltro(filtro === "outros" ? "" : "outros")}>Outros bancos (sem C6 e Itaú): <b>{pend.filter((p) => p.chave !== "ITAU" && p.chave !== "C6").length}</b></button>
          <button className={"chip" + (filtro === "atend" ? " on" : "")} onClick={() => setFiltro(filtro === "atend" ? "" : "atend")}>Com atendimento aberto, sem processo: <b>{pend.filter((p) => p.situacao === "so_atendimento").length}</b></button>
        </div>

        {!vis.length ? <div className="empty">{lidas.length ? "Nenhum banco sem processo com esse filtro." : "Ainda não li nenhum documento. Clique em “Ler os documentos”."}</div> :
          <div className="tscroll"><table className="grid">
            <thead><tr><th>Cliente</th><th>Banco sem processo</th><th>Procuração</th><th>Processos do cliente</th><th /></tr></thead>
            <tbody>{vis.map((p) => (
              <tr key={(p.clienteId || p.cliente) + p.chave}>
                <td>{p.clienteId ? <Link className="reflink" href={"/clientes/" + p.clienteId}><b>{nomeBonito(p.cliente)}</b></Link> : <b>{nomeBonito(p.cliente)}</b>}
                  {p.cpf && <div className="muted s mono">{p.cpf}</div>}{!p.clienteId && <div className="s late">sem ficha de cliente</div>}</td>
                <td><span className={"pill " + (p.situacao === "sem_nada" ? "late" : "soon")}>{p.banco}</span>{p.itau029 && <span className="pill acc" style={{ marginLeft: 4 }}>029</span>}
                  <div className="muted s">{p.bancosNaProc.map((b) => b.nome + (b.codigo ? " (" + b.codigo + ")" : "")).join(" · ")}</div>
                  {p.situacao === "so_atendimento" && p.casoId && <button className="reflink s" onClick={() => j.abrirCaso(p.casoId!)}>tem atendimento aberto, sem processo</button>}</td>
                <td>{p.procuracoes.map((l) => <div key={l.documento_id}>
                  {l.doc ? <button className="reflink" onClick={() => visor.verGuardado(l.doc!.caminho, l.doc!.nome, l.doc!.mime)}>📄 {l.doc.nome}</button> : <span className="muted">documento</span>}
                  <span className="muted s">{l.data_doc ? " · assinada em " + dataBR(l.data_doc) : ""}{l.doc?.em ? " · guardada em " + dataBR(l.doc.em.slice(0, 10)) : ""}</span>
                  {l.resumo && <div className="muted s">{l.resumo}</div>}</div>)}</td>
                <td>{p.processosDoCliente.length ? p.processosDoCliente.map((x) => <div key={x.numero}><button className="reflink s mono" onClick={() => j.abrirProcesso(x.numero)}>{x.mascara}</button> <span className="muted s">{x.banco}</span></div>) : <span className="muted s">nenhum</span>}</td>
                <td><button className="btn ghost" title="Já verifiquei: não vai virar ação (ou o processo está com outro nome). Sai da lista." onClick={() => conferir(p)}>Já conferido</button></td>
              </tr>))}</tbody>
          </table></div>}

        {comErro.length > 0 && <details className="prc-caixa" style={{ marginTop: 14 }}><summary><b>Não consegui ler {comErro.length} documento(s)</b> <span className="muted s">(arquivo apagado, imagem muito grande ou PDF protegido)</span></summary>
          <ul className="s">{comErro.slice(0, 200).map((l) => <li key={l.documento_id}>{l.doc ? <button className="reflink" onClick={() => visor.verGuardado(l.doc!.caminho, l.doc!.nome, l.doc!.mime)}>{l.doc.nome}</button> : "documento"} <span className="muted">— {l.erro}</span>
            {l.cliente_id && clientes.get(l.cliente_id) && <> · <Link className="reflink" href={"/clientes/" + l.cliente_id}>{nomeBonito(clientes.get(l.cliente_id)!.nome)}</Link></>}</li>)}</ul>
          <button className="btn" onClick={tentarDeNovo}>Tentar ler de novo</button></details>}
      </>}
    </div>
  );
}
