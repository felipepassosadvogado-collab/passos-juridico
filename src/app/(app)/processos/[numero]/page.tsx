"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR, iniciais, nomeBonito } from "@/lib/formato";
import { cidadeDoJuizo, infoCnj } from "@/lib/cnj";
import { diferencaDias, situacaoPrazo } from "@/lib/prazos";
import { FASES, atoPub, faseCRM } from "@/lib/regras";
import type { Evento, Publicacao, Tarefa } from "@/lib/tipos";
import { FormTarefa, TabelaTarefas, MiniTarefa } from "@/components/tarefas";
import { CorpoPublicacao, useAnalisar } from "@/components/publicacoes";
import { useCriarAviso } from "@/components/avisos";
import { useJanelas } from "@/components/janelas";
import { Ic, SelResp } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOME_EV: Record<string, string> = {
  tarefa_criada: "", tarefa_iniciada: "Começou a tarefa", correcao_enviada: "Enviou para correção", correcao_devolvida: "Devolveu com ajustes",
  correcao_aprovada: "Aprovou a peça", tarefa_concluida: "Concluiu a tarefa", tarefa_reaberta: "Reabriu a tarefa", tarefa_editada: "Editou a tarefa",
  tarefa_atribuida: "Atribuiu a tarefa", protocolo_avisado: "Protocolo realizado", tarefa_excluida: "Tarefa excluída", prazo_excluido: "Tarefa excluída",
};

function CorpoEvento({ e, t, nome }: { e: Evento; t?: Tarefa; nome: (id?: string | null) => string }) {
  const d = e.dados as Record<string, any>; const desc = d.descricao || d.texto || "";
  const quem = d.responsavel ? nome(d.responsavel) : d.resp ? nome(d.resp) : "sem responsável";
  const selos = <>{d.urgente && <span className="selo urg">Urgente</span>}{d.importante && <span className="selo imp">Importante</span>}</>;
  switch (e.tipo) {
    case "comentario": return <div className="bt" style={{ whiteSpace: "pre-wrap" }}>{d.texto}</div>;
    case "tarefa_criada": {
      const s = t ? (t.status === "feito" ? ["ok", "cumprida"] : t.status === "andamento" ? ["acc", "em andamento"] : [situacaoPrazo(t.vencimento).cor, situacaoPrazo(t.vencimento).texto]) : null;
      return <><div className="bt">{selos}{d.origem ? d.origem + " → " : ""}tarefa para <strong>{quem}</strong>: {desc}{d.dias ? ` (${d.dias} dias úteis)` : ""}</div>
        {d.vencimento && <div className="bs">Vence em {dataBR(d.vencimento)}</div>}{s && <div className="bs">Situação agora: <span className={"pill " + s[0]}>{s[1]}</span></div>}</>;
    }
    case "tarefa_concluida": return <><div className="bt">Concluiu a tarefa: <strong>{desc}</strong>{d.protocolo_avisado ? " · protocolo avisado" : ""}</div>
      {d.vencimento && <div className="bs">{diferencaDias(d.vencimento, new Date(e.em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) >= 0 ? "No prazo · vencia " : "Após o vencimento · vencia "}{dataBR(d.vencimento)}</div>}</>;
    case "correcao_enviada": return <><div className="bt">Enviou para correção de <strong>{nome(d.revisor || d.responsavel || d.resp)}</strong>: {desc}</div>{d.nota && <div className="bt nota">“{d.nota}”</div>}{d.arquivos?.length > 0 && <div className="bs">Anexo: {d.arquivos.join(", ")}</div>}</>;
    case "correcao_devolvida": return <><div className="bt">Devolveu com ajustes para <strong>{quem}</strong>: {desc}</div>{d.nota && <div className="bt nota">“{d.nota}”</div>}{d.arquivos?.length > 0 && <div className="bs">Versão corrigida: {d.arquivos.join(", ")}</div>}</>;
    case "correcao_aprovada": return <><div className="bt">Aprovou a peça: <strong>{desc}</strong></div><div className="bs">{quem} pode protocolar e concluir.</div></>;
    case "protocolo_avisado": return <div className="bt">Protocolo realizado: <strong>{desc}</strong></div>;
    case "tarefa_editada": return <><div className="bt">Editou a tarefa: <strong>{desc}</strong></div>{(d.mudancas || []).map((m: string, i: number) => <div key={i} className="bs">{m}</div>)}
      {d.antes && d.depois && <>{d.antes.vencimento !== d.depois.vencimento && <div className="bs">vencimento: {dataBR(d.antes.vencimento)} → {dataBR(d.depois.vencimento)}</div>}
        {d.antes.descricao !== d.depois.descricao && <div className="bs">descrição: “{d.antes.descricao}” → “{d.depois.descricao}”</div>}
        {d.antes.importante !== d.depois.importante && <div className="bs">{d.depois.importante ? "marcada como importante" : "deixou de ser importante"}</div>}
        {d.antes.urgente !== d.depois.urgente && <div className="bs">{d.depois.urgente ? "marcada como urgente" : "deixou de ser urgente"}</div>}</>}</>;
    case "tarefa_atribuida": return <div className="bt">Atribuiu a tarefa “{desc}” a <strong>{quem}</strong>.</div>;
    case "tarefa_iniciada": case "tarefa_reaberta": return <div className="bt">{NOME_EV[e.tipo]}: <strong>{desc}</strong></div>;
    case "tarefa_excluida": case "prazo_excluido": return <div className="bt">Tarefa excluída: {desc}{d.vencimento ? ` (vencia ${dataBR(d.vencimento)})` : ""}</div>;
    case "fase": return <div className="bt">Fase alterada para <strong>{d.fase || d.texto || "sem fase"}</strong>.</div>;
    case "responsavel": case "resp": return <div className="bt">Responsável pelo processo: <strong>{nome(d.responsavel || d.resp)}</strong>.</div>;
    case "processo_cadastrado": case "cadastro": return <div className="bt">Processo cadastrado.{d.texto ? " " + d.texto : ""}</div>;
    case "importado": return <div className="bt muted">Histórico trazido do painel antigo.</div>;
    case "analise_concluida": return <div className="bt">Concluiu a análise da <strong>{d.origem || "publicação"}</strong>: {d.texto}</div>;
    case "ciencia": return <div className="bt">{d.origem || "Publicação"}: só ciência, sem prazo.</div>;
    case "aviso_criado": return <div className="bt">Marcou para avisar o cliente: <strong>{d.texto}</strong></div>;
    case "cliente_avisado": return <div className="bt">Avisou o cliente pelo WhatsApp: <strong>{d.texto}</strong></div>;
    case "aviso_reaberto": return <div className="bt">Aviso ao cliente voltou para pendente: {d.texto}</div>;
    default: return <div className="bt" style={{ whiteSpace: "pre-wrap" }}>{d.texto || d.descricao || e.tipo}</div>;
  }
}

export default function FichaProcesso({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = use(params);
  const { processos, clientes, tarefas, avisos, sb, eu, nome, aviso, aplicar, registrar, v } = useDados(); const j = useJanelas();
  const p = processos.get(numero);
  const [pubs, setPubs] = useState<Publicacao[] | null>(null); const [evs, setEvs] = useState<Evento[]>([]);
  const [ed, setEd] = useState({ fase: "", notas: "" }); const [tf, setTf] = useState(false);
  const [nota, setNota] = useState(""); const { analisar, ocupado } = useAnalisar(); const criarAviso = useCriarAviso(); const rolou = useRef(false);
  useEffect(() => { if (p) setEd({ fase: faseCRM(p.fase), notas: p.notas || "" }); }, [p?.numero]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [a, b] = await Promise.all([sb.from("publicacoes").select("*").eq("processo_numero", numero).order("data"), sb.from("eventos").select("*").eq("processo_numero", numero).order("em")]);
      if (!vivo) return; setPubs((a.data || []) as Publicacao[]); setEvs((b.data || []) as Evento[]);
    })();
    const canal = sb.channel("proc-" + numero)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "eventos", filter: "processo_numero=eq." + numero }, (x: any) => setEvs((l) => l.some((e) => e.id === x.new.id) ? l : [...l, { ...x.new, processo_numero: numero }]))
      .on("postgres_changes", { event: "*", schema: "public", table: "publicacoes", filter: "processo_numero=eq." + numero }, async (x: any) => {
        // relê a publicação do banco: o tempo real pode alterar números longos (como o do processo)
        if (!x.new?.id) return;
        const { data } = await sb.from("publicacoes").select("*").eq("id", x.new.id).maybeSingle();
        if (data) setPubs((l) => l ? [...l.filter((y) => y.id !== data.id), data as Publicacao].sort((a, b) => a.data.localeCompare(b.data)) : l);
      })
      .subscribe();
    return () => { vivo = false; sb.removeChannel(canal); };
  }, [numero, sb]);
  // link vindo de outra tela (#pub-… ou #tar-…): rola até o item e destaca
  useEffect(() => {
    if (!pubs || rolou.current) return; const h = window.location.hash.slice(1); if (!h) return; rolou.current = true;
    setTimeout(() => { const el = document.getElementById(h); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); } }, 250);
  }, [pubs]);
  const ts = useMemo(() => [...tarefas.values()].filter((t) => t.processo_numero === numero).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || "")), [tarefas, numero, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const avs = [...avisos.values()].filter((a) => a.processo_numero === numero).sort((a, b) => (b.data_evento || "").localeCompare(a.data_evento || ""));
  if (!p) return <div className="empty"><strong>Processo não encontrado.</strong><Link href="/processos">Voltar aos processos</Link></div>;
  const info = infoCnj(p.numero); const cli = p.cliente_id ? clientes.get(p.cliente_id) : undefined;
  const salvar = async (campos: Record<string, unknown>) => {
    const { data, error } = await sb.from("processos").update(campos).eq("numero", p.numero).select().single();
    if (error) { aviso(msgErro(error)); return; }
    aplicar("processos", data);
    if ("fase" in campos && (campos.fase || "") !== (p.fase || "")) registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: campos.fase || "Sem fase" } });
    if ("responsavel" in campos && campos.responsavel !== p.responsavel) registrar({ processo_numero: p.numero, tipo: "responsavel", dados: { responsavel: campos.responsavel } });
    aviso("Processo atualizado.");
  };
  const comentar = async () => { const t = nota.trim(); if (!t) return; setNota(""); const ev = await registrar({ processo_numero: p.numero, tipo: "comentario", dados: { texto: t.slice(0, 4000) } }); if (ev) setEvs((l) => l.some((x) => x.id === ev.id) ? l : [...l, ev]); else setNota(t); };
  type Item = { t: string; pub?: Publicacao; ev?: Evento };
  const itens: Item[] = [...(pubs || []).map((x) => ({ t: x.data + "T08:00:00-03:00", pub: x })), ...evs.map((x) => ({ t: x.em, ev: x }))].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  return (
    <>
      <div className="head"><div><h2>{nomeBonito(p.cliente_nome) || "—"}</h2><div className="sub mono">{p.mascara}</div></div>
        <div className="tools">{cli ? <Link className="btn" href={"/clientes/" + cli.id}>Ficha do cliente</Link>
          : <label className="f">Vincular a um cliente<select value="" onChange={(e) => e.target.value && salvar({ cliente_id: e.target.value })}><option value="">— escolher —</option>
            {[...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{nomeBonito(c.nome)}</option>)}</select></label>}</div></div>
      <section className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <dl className="kv">
          <dt>Réus</dt><dd>{p.reus.map(nomeBonito).join("; ") || "—"}</dd>
          <dt>Juízo</dt><dd>{p.orgao || "—"}</dd>
          <dt>Cidade</dt><dd>{p.cidade || cidadeDoJuizo(p.orgao) || "—"}</dd>
          <dt>Tribunal</dt><dd>{[p.tribunal || info?.tribunal, info?.ramo].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Classe</dt><dd>{p.classe || "—"}</dd>
        </dl>
        <div className="form2">
          <label className="f">Fase<select value={ed.fase} onChange={(e) => setEd({ ...ed, fase: e.target.value })}><option value="">— sem fase —</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className="f">Responsável pelo processo<SelResp valor={p.responsavel} onChange={(x) => salvar({ responsavel: x })} /></label>
          <label className="f full">Anotações fixas<textarea rows={2} value={ed.notas} onChange={(e) => setEd({ ...ed, notas: e.target.value })} /></label>
        </div>
        <div className="tools">
          <button className="btn" onClick={() => salvar({ fase: ed.fase || null, notas: ed.notas || null })}>Salvar</button>
          <button className={tf ? "btn ghost" : "btn primary"} onClick={() => setTf(!tf)}>{tf ? "Cancelar" : <>{Ic.tarefa}Criar tarefa</>}</button>
          <button className="btn ghost" onClick={() => j.abrirInicial({ clienteId: p.cliente_id, banco: p.banco, cidade: p.cidade || cidadeDoJuizo(p.orgao), numero: p.numero })}>Petição inicial (Word)</button>
        </div>
        {tf && <FormTarefa numero={p.numero} resp={p.responsavel || eu.id} onCriada={() => setTf(false)} />}
      </div></section>
      <section className="panel"><div className="ph"><h3>Tarefas</h3></div>{ts.length ? <TabelaTarefas lista={ts} mostrarProc={false} /> : <div className="empty">Nenhuma tarefa para este processo.</div>}</section>
      <section className="panel"><div className="ph"><h3>Avisos ao cliente</h3><button className="btn ghost" onClick={async () => { const id = await criarAviso({ processo_numero: p.numero }); if (id) j.abrirAviso(id); }}>Novo aviso</button></div>
        {avs.length ? <div className="rows">{avs.map((a) => <div key={a.id} className="row click" onClick={() => j.abrirAviso(a.id)}>
          <span className={"pill " + (a.status === "avisado" ? "ok" : "soon")}>{a.status === "avisado" ? "avisado" : "pendente"}</span>
          <div className="main"><div className="t">{(a.tipo_evento || "Ato") + (a.data_evento ? " · " + dataBR(a.data_evento) + (a.hora ? " " + a.hora.slice(0, 5) : "") : "")}</div><div className="s">{a.local || ""}</div></div><span /></div>)}</div>
          : <div className="empty">Nenhum aviso ao cliente neste processo.</div>}</section>
      <section className="panel"><div className="ph"><h3>Linha do tempo</h3><span className="muted" style={{ fontSize: 12 }}>{itens.length} registros</span></div>
        <div className="tlw">{pubs == null ? <div className="empty">Carregando…</div> : itens.length ? itens.map((it) => {
          if (it.pub) {
            const x = it.pub; const tsx = ts.filter((t) => t.publicacao_id === x.id); const abertas = tsx.filter((t) => t.status !== "feito");
            return <div key={"p" + x.id} id={"pub-" + x.id} className={"tl pub-tl" + (abertas.length ? " com-prazo" : tsx.length ? " prazo-ok" : "")}>
              <div className="av sys">DJ</div><div className="bub">
                {tsx.length > 0 && <div className="faixa">{abertas.length ? "Prazo em curso" : "Prazo cumprido"}<span> · {tsx.length} {tsx.length === 1 ? "tarefa gerada" : "tarefas geradas"}</span></div>}
                <div className="bh"><strong>{atoPub(x)}</strong> · {x.orgao || "DJEN"} · {dataBR(x.data)}{x.triagem === "pendente" && <> · <button className="reflink" onClick={() => j.abrirPub(x.id)}>na caixa de publicações</button></>}</div>
                <CorpoPublicacao pub={x} onAbrirAviso={j.abrirAviso} analisando={ocupado.has(x.id)} onAnalisar={async () => { const r = await analisar([x]); if (r) setPubs((l) => (l || []).map((y) => r.find((z) => z.id === y.id) || y)); }} />
              </div></div>;
          }
          const e = it.ev!; const t = e.tarefa_id ? tarefas.get(e.tarefa_id) : undefined; const autor = e.por ? nome(e.por) : "Sistema";
          return <div key={"e" + e.id} className={"tl" + (e.por === eu.id ? " meu" : "") + (e.tipo === "comentario" ? " com" : "")}>
            <div className={"av" + (e.por ? "" : " sys")}>{e.por ? iniciais(autor) : "DJ"}</div>
            <div className="bub"><div className="bh"><strong>{autor}</strong> · {dataHoraBR(e.em)}</div><CorpoEvento e={e} t={t} nome={nome} />
              {e.publicacao_id && e.tipo !== "analise_concluida" && pubs.some((y) => y.id === e.publicacao_id) && <button className="reflink" onClick={() => { const el = document.getElementById("pub-" + e.publicacao_id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.classList.remove("flash"); void el?.offsetWidth; el?.classList.add("flash"); }}>↳ referente a: {atoPub(pubs.find((y) => y.id === e.publicacao_id)!)} de {dataBR(pubs.find((y) => y.id === e.publicacao_id)!.data)}</button>}
              {t && e.tipo === "tarefa_criada" && <MiniTarefa t={t} onClick={() => { const el = document.getElementById("tar-" + t.id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.classList.remove("flash"); void (el as HTMLElement | null)?.offsetWidth; el?.classList.add("flash"); }} />}
            </div></div>;
        }) : <div className="empty">Nada registrado ainda. As publicações, tarefas e anotações deste processo aparecem aqui em ordem.</div>}</div>
        <div className="composer"><textarea rows={2} value={nota} placeholder="Escreva uma anotação para a equipe…  (Ctrl+Enter envia)" onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); comentar(); } }} /><button className="btn primary" onClick={comentar}>Enviar</button></div>
      </section>
    </>
  );
}
