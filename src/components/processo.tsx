"use client";
// Processo: caixa compacta (no estilo do ADVBOX) com abas Tarefas, Andamentos, Intimações e Dados.
// A mesma caixa serve de página inteira em /processos/[numero].
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, dataHoraBR, iniciais, nomeBonito } from "@/lib/formato";
import { cidadeDoJuizo, infoCnj } from "@/lib/cnj";
import { diferencaDias, situacaoPrazo } from "@/lib/prazos";
import { FASES, atoPub, faseCRM } from "@/lib/regras";
import type { Evento, Publicacao, Tarefa } from "@/lib/tipos";
import { FormTarefa, ListaAnexos } from "./tarefas";
import { CampoValores } from "./valores";
import { CorpoPublicacao, useAnalisar } from "./publicacoes";
import { useCriarAviso } from "./avisos";
import { useJanelas } from "./janelas";
import { Avatar, Ic, RostoOuIniciais, SelResp } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Aba = "tarefas" | "andamentos" | "intimacoes" | "dados";
export type FocoProcesso = { aba?: Aba; alvo?: string };

/** publicações e linha do tempo do processo, com atualização em tempo real */
function useHistorico(numero: string) {
  const { sb } = useDados();
  const [pubs, setPubs] = useState<Publicacao[] | null>(null); const [evs, setEvs] = useState<Evento[]>([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [a, b] = await Promise.all([sb.from("publicacoes").select("*").eq("processo_numero", numero).order("data"), sb.from("eventos").select("*").eq("processo_numero", numero).order("em")]);
      if (!vivo) return; setPubs((a.data || []) as Publicacao[]); setEvs((b.data || []) as Evento[]);
    })();
    const canal = sb.channel("proc-" + numero + "-" + Math.random().toString(36).slice(2, 6))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "eventos", filter: "processo_numero=eq." + numero }, (x: any) => setEvs((l) => (l.some((e) => e.id === x.new.id) ? l : [...l, { ...x.new, processo_numero: numero }])))
      .on("postgres_changes", { event: "*", schema: "public", table: "publicacoes", filter: "processo_numero=eq." + numero }, async (x: any) => {
        // relê do banco: o tempo real pode alterar números longos (como o do processo)
        if (!x.new?.id) return;
        const { data } = await sb.from("publicacoes").select("*").eq("id", x.new.id).maybeSingle();
        if (data) setPubs((l) => (l ? [...l.filter((y) => y.id !== data.id), data as Publicacao].sort((a, b) => a.data.localeCompare(b.data)) : l));
      })
      .subscribe();
    return () => { vivo = false; sb.removeChannel(canal); };
  }, [numero, sb]);
  return { pubs, setPubs, evs, setEvs };
}

function InfoProtocolo({ d }: { d: Record<string, any> }) {
  if (!d.protocolo && !d.protocolo_em && !d.protocolo_obs) return null;
  return <div className="bs prot">{d.protocolo ? <>Protocolo nº <strong className="mono">{d.protocolo}</strong></> : "Protocolo"}{d.protocolo_em ? " · " + dataHoraBR(d.protocolo_em) : ""}{d.protocolo_obs && <div className="bt nota">“{d.protocolo_obs}”</div>}</div>;
}
const NOME_EV: Record<string, string> = { tarefa_iniciada: "Começou a tarefa", tarefa_reaberta: "Reabriu a tarefa" };
export function CorpoEvento({ e, t, nome }: { e: Evento; t?: Tarefa; nome: (id?: string | null) => string }) {
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
    case "tarefa_concluida": return <><div className="bt">{d.protocolo_avisado ? "Protocolou e concluiu" : "Concluiu a tarefa"}: <strong>{desc}</strong></div>{d.protocolo_avisado && <InfoProtocolo d={d} />}
      {d.vencimento && <div className="bs">{diferencaDias(d.vencimento, new Date(e.em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) >= 0 ? "No prazo · vencia " : "Após o vencimento · vencia "}{dataBR(d.vencimento)}</div>}</>;
    case "correcao_enviada": return <><div className="bt">Enviou para correção de <strong>{nome(d.revisor || d.responsavel || d.resp)}</strong>: {desc}</div>{d.nota && <div className="bt nota">“{d.nota}”</div>}{d.arquivos?.length > 0 && <div className="bs">Anexo: {d.arquivos.join(", ")}</div>}</>;
    case "correcao_devolvida": return <><div className="bt">Devolveu com ajustes para <strong>{quem}</strong>: {desc}</div>{d.nota && <div className="bt nota">“{d.nota}”</div>}{d.arquivos?.length > 0 && <div className="bs">Versão corrigida: {d.arquivos.join(", ")}</div>}</>;
    case "correcao_aprovada": return <><div className="bt">Aprovou a peça: <strong>{desc}</strong></div><div className="bs">{quem} pode protocolar e concluir.</div></>;
    case "protocolo_avisado": return <><div className="bt">Protocolo realizado: <strong>{desc}</strong></div><InfoProtocolo d={d} /></>;
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

/** cartão de tarefa no estilo do ADVBOX: bolinha, título, prazo, anexos e quem fez */
function CartaoTarefa({ t, onAbrir }: { t: Tarefa; onAbrir: () => void }) {
  const { nome } = useDados(); const done = t.status === "feito"; const s = situacaoPrazo(t.vencimento);
  const cor = done ? "var(--ok)" : t.status === "revisao" || t.status === "ajustes" ? "var(--soon)" : s.cor === "late" ? "var(--late)" : s.cor === "soon" ? "var(--soon)" : "var(--accent)";
  return (
    <div className="tcard" id={"tar-" + t.id}>
      <button className="tc-topo" onClick={onAbrir}>
        <span className="tc-dot" style={{ background: cor }} />
        <span className="tc-tit">{t.urgente && <span className="lx-flag urg">!</span>}{t.importante && <span className="lx-flag imp">★</span>}{t.descricao}</span>
        <span className="tc-data">{dataBR(t.vencimento)}</span>
      </button>
      <div className="tc-corpo">
        <div className="tc-linha">{done ? <span className="pill ok">cumprida em {dataHoraBR(t.feito_em).slice(0, 10)}</span> : <span className={"pill " + s.cor}>Prazo fatal: {dataBR(t.vencimento)} · {s.texto}</span>}
          {t.status === "revisao" && <span className="pill acc">em correção com {nome(t.revisor)}</span>}{t.status === "ajustes" && <span className="pill soon">ajustes pedidos</span>}{t.status === "aprovada" && <span className="pill ok">aprovada · protocolar</span>}{t.status === "andamento" && <span className="pill acc">em andamento</span>}</div>
        <ListaAnexos t={t} />
      </div>
      <div className="tc-pe"><span className="muted">{dataHoraBR(t.criado_em)} · criada por {nome(t.criado_por)}</span><span className="tc-av"><Avatar id={t.criado_por} pequeno /><Avatar id={t.responsavel} pequeno /></span></div>
    </div>
  );
}

export function PainelProcesso({ numero, foco, emJanela, onFechar }: { numero: string; foco?: FocoProcesso; emJanela?: boolean; onFechar?: () => void }) {
  const { processos, clientes, tarefas, avisos, sb, eu, nome, aviso, aplicar, registrar, v } = useDados(); const j = useJanelas();
  const p = processos.get(numero);
  const { pubs, setPubs, evs, setEvs } = useHistorico(numero);
  const [aba, setAba] = useState<Aba>(foco?.aba || "tarefas");
  const [filtro, setFiltro] = useState<"todas" | "abertas" | "feitas">("todas");
  const [tf, setTf] = useState(false); const [nota, setNota] = useState(""); const [ed, setEd] = useState({ fase: "", notas: "" });
  const { analisar, ocupado } = useAnalisar(); const criarAviso = useCriarAviso(); const corpo = useRef<HTMLDivElement>(null); const rolou = useRef(false);
  useEffect(() => { if (p) setEd({ fase: faseCRM(p.fase), notas: p.notas || "" }); }, [p?.numero]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!foco?.alvo || rolou.current || (foco.alvo.startsWith("pub-") && !pubs)) return; rolou.current = true;
    setTimeout(() => { const el = document.getElementById(foco.alvo!); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); } }, 250);
  }, [pubs, foco?.alvo]);
  const ts = useMemo(() => [...tarefas.values()].filter((t) => t.processo_numero === numero).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || "")), [tarefas, numero, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <div className="empty"><strong>Processo não encontrado.</strong>{emJanela ? <button className="reflink" onClick={onFechar}>Fechar</button> : <Link href="/processos">Voltar aos processos</Link>}</div>;
  const info = infoCnj(p.numero); const cli = p.cliente_id ? clientes.get(p.cliente_id) : undefined;
  const avs = [...avisos.values()].filter((a) => a.processo_numero === numero).sort((a, b) => (b.data_evento || "").localeCompare(a.data_evento || ""));
  const reus = (p.reus || []).map((r) => bancoCurto(r) === "INSS" ? "INSS" : bancoCurto(r));
  const titulo = [nomeBonito(p.cliente_nome || "—"), ...reus.slice(0, 2)].join(" x ");
  const salvar = async (campos: Record<string, unknown>) => {
    const { data, error } = await sb.from("processos").update(campos).eq("numero", p.numero).select().single();
    if (error) { aviso(msgErro(error)); return; }
    aplicar("processos", data);
    if ("fase" in campos && (campos.fase || "") !== (p.fase || "")) registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: campos.fase || "Sem fase" } });
    if ("responsavel" in campos && campos.responsavel !== p.responsavel) registrar({ processo_numero: p.numero, tipo: "responsavel", dados: { responsavel: campos.responsavel } });
    aviso("Processo atualizado.");
  };
  const comentar = async () => { const t = nota.trim(); if (!t) return; setNota(""); const ev = await registrar({ processo_numero: p.numero, tipo: "comentario", dados: { texto: t.slice(0, 4000) } }); if (ev) setEvs((l) => (l.some((x) => x.id === ev.id) ? l : [...l, ev])); else setNota(t); };
  const tsF = ts.filter((t) => filtro === "todas" || (filtro === "abertas" ? t.status !== "feito" : t.status === "feito"));
  const andamentos = [...evs].filter((e) => e.tipo !== "importado").sort((a, b) => b.em.localeCompare(a.em));
  const intimacoes = [...(pubs || [])].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
  const pend = intimacoes.filter((x) => x.triagem === "pendente").length;
  const icone = (titulo: string, svg: React.ReactNode, onClick: () => void, ativo?: boolean) => <button className={"icb-q" + (ativo ? " on" : "")} title={titulo} aria-label={titulo} onClick={onClick}>{svg}</button>;
  const S = (d: string) => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
  const irPub = (id: number) => { setAba("intimacoes"); setTimeout(() => { const el = document.getElementById("pub-" + id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.classList.remove("flash"); void (el as HTMLElement | null)?.offsetWidth; el?.classList.add("flash"); }, 120); };
  return (
    <div className={"proc" + (emJanela ? "" : " pagina")}>
      <div className="proc-cab">
        <div className="proc-icones">
          {icone("Dados do processo", S('<path d="M2.5 6V15a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5H4A1.5 1.5 0 0 0 2.5 6z"/>'), () => setAba("dados"), aba === "dados")}
          {icone("Linha do tempo (andamentos)", S('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>'), () => setAba("andamentos"), aba === "andamentos")}
          {icone("Nova tarefa", S('<rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M10 6.5v7M6.5 10h7"/>'), () => { setAba("tarefas"); setTf(true); })}
          {icone("Gerar petição com o Claude", S('<path d="M10 2.5l1.7 5 5.3.1-4.2 3.2 1.5 5.1L10 12.9l-4.3 3 1.5-5.1L3 7.6l5.3-.1z"/>'), () => j.gerarPeca({ numero: p.numero }))}
          {icone("Petição inicial (Word)", S('<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5"/>'), () => j.abrirInicial({ clienteId: p.cliente_id, banco: p.banco, cidade: p.cidade || cidadeDoJuizo(p.orgao), numero: p.numero }))}
          {icone("Avisar o cliente", S('<path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z"/><path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>'), async () => { const id = await criarAviso({ processo_numero: p.numero }); if (id) j.abrirAviso(id); })}
          {cli && <Link className="icb-q" title="Ficha do cliente" aria-label="Ficha do cliente" href={"/clientes/" + cli.id} onClick={onFechar}>{S('<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>')}</Link>}
          {emJanela && <Link className="icb-q" title="Abrir em página inteira" aria-label="Abrir em página inteira" href={"/processos/" + p.numero} onClick={onFechar}>{S('<path d="M11.5 3.5h5v5M16.5 3.5l-6 6M8.5 4.5h-4v11h11v-4"/>')}</Link>}
        </div>
        {emJanela && <button className="icb" title="Fechar" aria-label="Fechar" onClick={onFechar}>✕</button>}
      </div>
      <div className="proc-tit">
        <h2>{titulo}</h2>
        <div className="mono muted proc-num">{p.mascara}
          <button className="icb-q mini" title="Copiar o número" onClick={async () => { try { await navigator.clipboard.writeText(p.mascara); aviso("Número copiado."); } catch { aviso(p.mascara); } }}>{S('<rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>')}</button>
          <span className="s"> · {p.orgao || "juízo não informado"}{faseCRM(p.fase) ? " · " + faseCRM(p.fase) : ""}</span></div>
      </div>
      <div className="abas" role="tablist">
        {([["tarefas", "Tarefas", ts.filter((t) => t.status !== "feito").length], ["andamentos", "Andamentos", 0], ["intimacoes", "Intimações", pend], ["dados", "Dados", 0]] as [Aba, string, number][]).map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}>{t}{n > 0 && <span className="count hot">{n}</span>}</button>))}
      </div>
      <div className="proc-corpo" ref={corpo}>
        {aba === "tarefas" && <>
          <div className="tools"><select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}><option value="todas">Todas as atividades</option><option value="abertas">Em aberto</option><option value="feitas">Cumpridas</option></select>
            <button className={tf ? "btn ghost" : "btn primary"} onClick={() => setTf(!tf)}>{tf ? "Cancelar" : <>{Ic.tarefa}Nova tarefa</>}</button></div>
          {tf && <FormTarefa numero={p.numero} resp={p.responsavel || eu.id} onCriada={() => setTf(false)} />}
          {tsF.length ? tsF.map((t) => <CartaoTarefa key={t.id} t={t} onAbrir={() => j.abrirTarefa(t.id)} />) : <div className="empty">Nenhuma tarefa {filtro === "abertas" ? "em aberto" : filtro === "feitas" ? "cumprida" : ""} neste processo.</div>}
        </>}
        {aba === "andamentos" && <>
          <div className="composer" style={{ padding: 0, border: 0 }}><textarea rows={2} value={nota} placeholder="Escreva uma anotação para a equipe…  (Ctrl+Enter envia)" onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); comentar(); } }} /><button className="btn primary" onClick={comentar}>Enviar</button></div>
          <div className="tlw" style={{ padding: 0 }}>{andamentos.length ? andamentos.map((e) => {
            const t = e.tarefa_id ? tarefas.get(e.tarefa_id) : undefined; const autor = e.por ? nome(e.por) : "Sistema"; const px = e.publicacao_id ? (pubs || []).find((y) => y.id === e.publicacao_id) : undefined;
            return <div key={e.id} className={"tl" + (e.por === eu.id ? " meu" : "") + (e.tipo === "comentario" ? " com" : "")}>
              <div className={"av" + (e.por ? "" : " sys")}>{e.por ? <RostoOuIniciais id={e.por} /> : "DJ"}</div>
              <div className="bub"><div className="bh"><strong>{autor}</strong> · {dataHoraBR(e.em)}</div><CorpoEvento e={e} t={t} nome={nome} />
                {px && e.tipo !== "analise_concluida" && <button className="reflink" onClick={() => irPub(px.id)}>↳ referente a: {atoPub(px)} de {dataBR(px.data)}</button>}
                {t && e.tipo === "tarefa_criada" && <button className="reflink" onClick={() => j.abrirTarefa(t.id)}>↳ abrir a tarefa</button>}
              </div></div>;
          }) : <div className="empty">Nenhum andamento registrado ainda.</div>}</div>
        </>}
        {aba === "intimacoes" && (pubs == null ? <div className="empty">Carregando…</div> : intimacoes.length ? intimacoes.map((x) => {
          const tsx = ts.filter((t) => t.publicacao_id === x.id); const abertas = tsx.filter((t) => t.status !== "feito");
          return <div key={x.id} id={"pub-" + x.id} className={"tl pub-tl" + (abertas.length ? " com-prazo" : tsx.length ? " prazo-ok" : "")} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
            <div className="bub">
              {tsx.length > 0 && <div className="faixa">{abertas.length ? "Prazo em curso" : "Prazo cumprido"}<span> · {tsx.length} {tsx.length === 1 ? "tarefa gerada" : "tarefas geradas"}</span></div>}
              <div className="bh"><strong>{atoPub(x)}</strong> · {x.orgao || "DJEN"} · {dataBR(x.data)}{x.triagem === "pendente" && <> · <button className="reflink" onClick={() => j.abrirPub(x.id)}>na caixa de publicações</button></>}</div>
              <CorpoPublicacao pub={x} onAbrirAviso={j.abrirAviso} analisando={ocupado.has(x.id)} onAnalisar={async () => { const r = await analisar([x]); if (r) setPubs((l) => (l || []).map((y) => r.find((z) => z.id === y.id) || y)); }} />
            </div></div>;
        }) : <div className="empty">Nenhuma intimação deste processo no DJEN.</div>)}
        {aba === "dados" && <>
          {cli ? <div className="tools"><Link className="btn" href={"/clientes/" + cli.id} onClick={onFechar}>Ficha do cliente: {nomeBonito(cli.nome)}</Link></div>
            : <label className="f">Vincular a um cliente<select value="" onChange={(e) => e.target.value && salvar({ cliente_id: e.target.value })}><option value="">— escolher —</option>
              {[...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{nomeBonito(c.nome)}</option>)}</select></label>}
          <CampoValores compacto valor={p.valor_causa} pct={p.honorarios_pct} onSalvar={(c) => salvar(c)} />
          <dl className="kv">
            <dt>Autor(a)</dt><dd>{nomeBonito(p.cliente_nome) || "—"}</dd>
            <dt>Réus</dt><dd>{p.reus.map(nomeBonito).join("; ") || "—"}</dd>
            <dt>Juízo</dt><dd>{p.orgao || "—"}</dd>
            <dt>Cidade</dt><dd>{p.cidade || cidadeDoJuizo(p.orgao) || "—"}</dd>
            <dt>Tribunal</dt><dd>{[p.tribunal || info?.tribunal, info?.ramo].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Classe</dt><dd>{p.classe || "—"}</dd>
            <dt>Último ato</dt><dd>{p.ultimo_ato || "—"} {p.ultima_data ? "· " + dataBR(p.ultima_data) : ""}</dd>
          </dl>
          <div className="form2">
            <label className="f">Fase<select value={ed.fase} onChange={(e) => setEd({ ...ed, fase: e.target.value })}><option value="">— sem fase —</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label className="f">Responsável pelo processo<SelResp valor={p.responsavel} onChange={(x) => salvar({ responsavel: x })} /></label>
            <label className="f full">Anotações fixas<textarea rows={3} value={ed.notas} onChange={(e) => setEd({ ...ed, notas: e.target.value })} /></label>
          </div>
          <div className="tools"><button className="btn primary" onClick={() => salvar({ fase: ed.fase || null, notas: ed.notas || null })}>Salvar</button></div>
          <section className="panel"><div className="ph"><h3>Avisos ao cliente</h3><button className="btn ghost" onClick={async () => { const id = await criarAviso({ processo_numero: p.numero }); if (id) j.abrirAviso(id); }}>Novo aviso</button></div>
            {avs.length ? <div className="rows">{avs.map((a) => <div key={a.id} className="row click" onClick={() => j.abrirAviso(a.id)}>
              <span className={"pill " + (a.status === "avisado" ? "ok" : "soon")}>{a.status === "avisado" ? "avisado" : "pendente"}</span>
              <div className="main"><div className="t">{(a.tipo_evento || "Ato") + (a.data_evento ? " · " + dataBR(a.data_evento) + (a.hora ? " " + a.hora.slice(0, 5) : "") : "")}</div><div className="s">{a.local || ""}</div></div><span /></div>)}</div>
              : <div className="empty">Nenhum aviso ao cliente neste processo.</div>}</section>
        </>}
      </div>
    </div>
  );
}

/** a caixa do processo por cima da tela atual */
export function JanelaProcesso({ numero, foco, onFechar }: { numero: string; foco?: FocoProcesso; onFechar: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", k); document.body.classList.add("sem-rolagem");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("sem-rolagem"); };
  }, [onFechar]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Processo"><PainelProcesso numero={numero} foco={foco} emJanela onFechar={onFechar} /></div>
    </div>
  );
}
