"use client";
// Audiências e coletas de padrão grafotécnico: agendar a partir da publicação e acompanhar em Meus expedientes.
// O ato fica no próprio aviso ao cliente (avisos_cliente), então o aviso pelo WhatsApp é o mesmo de sempre.
import { linkSeguro } from "@/lib/link";
import { useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR, nomeBonito } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { ATOS_AGENDA, MODALIDADES, TIPOS_AUDIENCIA, ehAgenda, ehAudiencia, tipoAudienciaDoTexto } from "@/lib/regras";
import type { Analise, Aviso, Modalidade, Publicacao } from "@/lib/tipos";
import { PillConfirmacao, useCriarAviso } from "./avisos";
import { useJanelas } from "./janelas";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const resumoAto = (a: Pick<Aviso, "tipo_evento" | "modalidade" | "hora" | "data_evento">) =>
  [a.tipo_evento || "Ato", a.modalidade ? MODALIDADES[a.modalidade].curto : "", a.modalidade === "jf_balcao" ? (a.data_evento ? "até " + dataBR(a.data_evento) : "") : (a.hora || "").slice(0, 5)].filter(Boolean).join(" · ");

/** formulário de agendamento: tipo do ato, modalidade, data/hora, link ou local e orientações */
export function FormAgendar({ numero, pub, av, onFim }: { numero: string; pub?: Publicacao; av?: Aviso; onFim: (id?: string) => void }) {
  const { processos, sb, aplicar, registrar, aviso } = useDados(); const criarAviso = useCriarAviso();
  const p = processos.get(numero); const ev = (pub?.analise as Analise | null)?.evento;
  const tipoBase = av?.tipo_evento && (ATOS_AGENDA.includes(av.tipo_evento) || ehAudiencia(av.tipo_evento)) ? av.tipo_evento : ev?.tipo && ATOS_AGENDA.includes(ev.tipo) ? ev.tipo : /coleta|padr[aã]o|grafot/i.test(pub?.texto || "") ? ATOS_AGENDA[1] : ATOS_AGENDA[0];
  // audiência: conciliação ou instrução (do que já estava salvo, ou do texto da intimação)
  const tipoIni = tipoBase === "Audiência" && pub?.texto ? tipoAudienciaDoTexto(pub.texto) : tipoBase;
  const modIni = (av?.modalidade || (ev?.modalidade && ev.modalidade in MODALIDADES ? ev.modalidade : "")) as Modalidade | "";
  const [f, setF] = useState({
    tipo: tipoIni, modalidade: modIni, data: av?.data_evento || (/^\d{4}-\d\d-\d\d$/.test(ev?.data || "") ? ev!.data! : ""),
    hora: (av?.hora || ev?.hora || "").slice(0, 5), link: av?.link || "", local: av?.local || ev?.local || "", orientacoes: av?.orientacoes || ev?.orientacoes || "",
  });
  const [ocupado, setOcupado] = useState(false);
  const localPadrao = p?.orgao || "Justiça Federal de Joinville";
  const salvar = async () => {
    if (!f.modalidade) { aviso("Escolha como vai ser: videoconferência, na JF com horário marcado ou no atendimento ao público."); return; }
    if (!f.data) { aviso(f.modalidade === "jf_balcao" ? "Informe até que dia o cliente pode comparecer." : "Informe a data."); return; }
    setOcupado(true);
    const campos: Partial<Aviso> = {
      tipo_evento: f.tipo, modalidade: f.modalidade, data_evento: f.data, hora: f.modalidade === "jf_balcao" ? null : f.hora || null,
      link: f.modalidade === "video" ? f.link.trim() || null : null, local: f.modalidade === "video" ? null : f.local.trim() || localPadrao,
      orientacoes: f.orientacoes.trim() || null, realizado_em: null,
    };
    let id = av?.id || null;
    if (!id) id = await criarAviso({ processo_numero: numero, publicacao_id: pub?.id ?? null });
    if (!id) { setOcupado(false); return; }
    const { data, error } = await sb.from("avisos_cliente").update(campos).eq("id", id).select().single();
    setOcupado(false);
    if (error) { aviso(/modalidade|link|realizado/.test(error.message) ? "Falta instalar a etapa 6 (0005_agenda.sql) no Supabase." : msgErro(error)); return; }
    aplicar("avisos", data);
    registrar({ processo_numero: numero, publicacao_id: pub?.id ?? av?.publicacao_id ?? null, tipo: "ato_agendado", dados: { texto: resumoAto(data as Aviso) + (f.modalidade !== "jf_balcao" ? " em " + dataBR(f.data) : "") } });
    aviso("Agendado. Aparece no Painel, em Audiências e coletas.");
    onFim(id);
  };
  const m = f.modalidade;
  return (
    <div className="agendar" onClick={(e) => e.stopPropagation()}>
      <div className="seg" role="radiogroup" aria-label="Ato">{ATOS_AGENDA.map((t) => { const on = t === ATOS_AGENDA[0] ? ehAudiencia(f.tipo) : f.tipo === t; return <button key={t} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => setF({ ...f, tipo: t === ATOS_AGENDA[0] && ehAudiencia(f.tipo) ? f.tipo : t })}>{t === ATOS_AGENDA[0] ? "Audiência" : "Coleta de padrão grafotécnico"}</button>; })}</div>
      {ehAudiencia(f.tipo) && <div className="seg" role="radiogroup" aria-label="Tipo de audiência">{[...TIPOS_AUDIENCIA, "Audiência"].map((t) => <button key={t} type="button" role="radio" aria-checked={f.tipo === t} className={f.tipo === t ? "on" : ""} onClick={() => setF({ ...f, tipo: t })}>{t === "Audiência" ? "Não informado" : t.replace("Audiência de ", "").replace(/^./, (c) => c.toUpperCase())}</button>)}</div>}
      <div className="mods" role="radiogroup" aria-label="Como vai ser">{(Object.keys(MODALIDADES) as Modalidade[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={m === k} className={"mod" + (m === k ? " on" : "")} onClick={() => setF({ ...f, modalidade: k })}>
          <span className="mod-ic">{k === "video" ? "▶" : k === "jf_agendado" ? "⏱" : "🏛"}</span><span>{MODALIDADES[k].nome}</span></button>))}</div>
      {m && <div className="triage">
        <label className="f">{m === "jf_balcao" ? "Comparecer até o dia" : "Data"}<input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
        {m !== "jf_balcao" && <label className="f">Hora<input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></label>}
        {m === "video" ? <label className="f wide2">Link da sala virtual<input value={f.link} placeholder="se já tiver; pode incluir depois" onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
          : <label className="f wide2">Local<input value={f.local} placeholder={localPadrao} onChange={(e) => setF({ ...f, local: e.target.value })} /></label>}
        <label className="f wide">Orientações ao cliente (opcional)<input value={f.orientacoes} placeholder="ex.: levar 3 documentos antigos assinados" onChange={(e) => setF({ ...f, orientacoes: e.target.value })} /></label>
      </div>}
      <div className="tools"><button className="btn primary" disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : av?.modalidade ? "Salvar agendamento" : "Agendar"}</button>
        <button className="btn ghost" onClick={() => onFim()}>Cancelar</button></div>
    </div>
  );
}

/** marca o ato como realizado (o cliente compareceu / assinou o termo) ou desfaz */
export function useRealizado() {
  const { sb, aplicar, registrar, aviso, eu } = useDados();
  return async (a: Aviso, sim: boolean) => {
    const { data, error } = await sb.from("avisos_cliente").update(sim ? { realizado_em: new Date().toISOString(), realizado_por: eu.id } : { realizado_em: null, realizado_por: null }).eq("id", a.id).select().single();
    if (error) { aviso(msgErro(error)); return; }
    aplicar("avisos", data);
    if (sim) registrar({ processo_numero: a.processo_numero, publicacao_id: a.publicacao_id, tipo: "ato_realizado", dados: { texto: (a.tipo_evento || "Ato") + " realizada(o)" + (a.data_evento ? " · " + dataBR(a.data_evento) : "") } });
    aviso(sim ? "Marcado como realizado." : "Voltou para a agenda.");
  };
}

/** uma linha de audiência/coleta: data, situação, aviso ao cliente e o botão de realizado */
function LinhaAto({ a, comCliente, onEditar }: { a: Aviso; comCliente?: boolean; onEditar?: () => void }) {
  const { processos, nome, aviso } = useDados(); const j = useJanelas(); const realizado = useRealizado();
  const p = processos.get(a.processo_numero); const dias = a.data_evento ? diferencaDias(a.data_evento, hojeBR()) : null; const balcao = a.modalidade === "jf_balcao";
  const rel = dias == null ? "sem data" : dias < 0 ? (balcao ? "prazo encerrado" : "já passou") : dias === 0 ? (balcao ? "último dia" : "é hoje") : dias === 1 ? (balcao ? "até amanhã" : "amanhã") : (balcao ? "faltam " : "em ") + dias + " dias";
  const avisado = a.status === "avisado"; const aud = ehAudiencia(a.tipo_evento); const encerrado = !a.realizado_em && dias != null && dias < 0;
  const quem = (comCliente ? nomeBonito(p?.cliente_nome || "") : a.tipo_evento || "ato") + (a.data_evento ? " em " + dataBR(a.data_evento) : "");
  return <div className={"row ag-row" + (a.realizado_em ? " feito" : "") + (aud ? " ag-aud" : "")}>
    <div className={"date" + (encerrado ? " ag-venc" : "")} title={encerrado ? (balcao ? "Prazo encerrado" : "Data já passou") : undefined}>{a.data_evento ? <>{balcao && <span className="ag-ate">até</span>}<b>{a.data_evento.slice(8, 10)}</b>{MES[+a.data_evento.slice(5, 7) - 1]}</> : "—"}</div>
    <div className="main">{comCliente ? <div className="t ag-nome"><button className="reflink forte" onClick={() => j.abrirProcesso(a.processo_numero, { aba: "intimacoes", alvo: a.publicacao_id ? "pub-" + a.publicacao_id : undefined })}>{nomeBonito(p?.cliente_nome || "—")}</button>
          <span className="ag-proc mono">{p?.mascara || a.processo_numero}</span>
          <button className="icb-q mini" title="Copiar o número do processo (para colar no eproc)" aria-label={"Copiar o número do processo de " + nomeBonito(p?.cliente_nome || "")}
            onClick={async () => { const n = p?.mascara || a.processo_numero; try { await navigator.clipboard.writeText(n); aviso("Número copiado: " + n); } catch { aviso(n); } }}>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" /></svg></button></div>
        : <div className="t">{a.tipo_evento || "Ato"}</div>}
      <div className="s">{comCliente ? resumoAto(a) : [a.modalidade ? MODALIDADES[a.modalidade].curto : "", balcao ? (a.data_evento ? "até " + dataBR(a.data_evento) : "") : [a.data_evento ? dataBR(a.data_evento) : "", (a.hora || "").slice(0, 5)].filter(Boolean).join(" às ")].filter(Boolean).join(" · ")}{a.modalidade === "video" && (linkSeguro(a.link) ? <> · <a href={linkSeguro(a.link)} target="_blank" rel="noopener noreferrer">link da sala ↗</a></> : " · sem link ainda")}{a.modalidade !== "video" && a.local ? " · " + a.local : ""}</div>
      <div className="ag-tags">{aud && <span className="pill ag-tipo"><span aria-hidden="true">⚖</span> {a.tipo_evento === "Audiência" ? "Audiência (tipo não informado)" : a.tipo_evento}{a.hora ? " · " + a.hora.slice(0, 5) : ""}</span>}{a.realizado_em ? <span className="pill ok">✓ REALIZADO · {nome(a.realizado_por)} · {dataHoraBR(a.realizado_em)}</span>
        : <span className={"pill " + (dias != null && dias < 0 ? "late" : dias != null && dias <= 3 ? "late" : dias != null && dias <= 7 ? "soon" : "acc")}>{rel}</span>}
        {avisado ? <span className="pill ok">✓ mensagem enviada · {nome(a.avisado_por).split(" ")[0]} · {dataHoraBR(a.avisado_em).slice(0, 5)}</span> : a.status === "dispensado" ? <span className="pill">sem aviso ao cliente</span> : <span className="pill late">mensagem não enviada</span>}
        {avisado && <PillConfirmacao av={a} />}</div></div>
    <div className="ag-acts">
      <button className={a.status !== "pendente" ? "btn ghost" : "btn wa"} title={a.status !== "pendente" ? "Ver a mensagem de aviso enviada ao cliente" : "Abrir o aviso para mandar a mensagem ao cliente pelo WhatsApp"} aria-label={(a.status !== "pendente" ? "Ver aviso: " : "Avisar o cliente: ") + quem} onClick={() => j.abrirAviso(a.id)}>{a.status !== "pendente" ? "Ver aviso" : "Avisar o cliente"}</button>
      {onEditar && !a.realizado_em && <button className="btn ghost" title="Editar data, hora, local ou modalidade" aria-label={"Editar o agendamento: " + quem} onClick={onEditar}>Editar</button>}
      {a.realizado_em ? <button className="btn ghost" title="Desfazer: o ato volta para a lista das próximas" aria-label={"Desfazer realizado: " + quem} onClick={() => realizado(a, false)}>Desfazer</button>
        : <button className="btn ghost" title="Marcar como realizado: o ato aconteceu (o cliente compareceu / assinou o termo)" aria-label={"Marcar como realizado: " + quem} onClick={() => realizado(a, true)}><span aria-hidden="true">✓</span> Realizado</button>}
    </div></div>;
}

/** dentro do processo: audiências e coletas deste processo (inclusive as realizadas) e o botão de agendar */
export function AtosDoProcesso({ numero, abrirForm, onFecharForm }: { numero: string; abrirForm?: boolean; onFecharForm?: () => void }) {
  const { avisos, v } = useDados(); const [form, setForm] = useState<"novo" | string | null>(null);
  const lista = useMemo(() => [...avisos.values()].filter((a) => a.processo_numero === numero && ehAgenda(a) && a.modalidade)
    .sort((a, b) => (!!a.realizado_em === !!b.realizado_em ? (b.data_evento || "").localeCompare(a.data_evento || "") : a.realizado_em ? 1 : -1)), [avisos, numero, v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (abrirForm) { setForm("novo"); onFecharForm?.(); } }, [abrirForm]); // eslint-disable-line react-hooks/exhaustive-deps
  const aberto = form; const fechar = () => setForm(null);
  return (
    <section className="panel agenda">
      <div className="ph"><h3>Audiências e coletas</h3><span className="muted" style={{ fontSize: 12 }}>deste processo</span>
        <button className={aberto === "novo" ? "btn ghost" : "btn"} style={{ marginLeft: "auto" }} onClick={() => (aberto === "novo" ? fechar() : setForm("novo"))}>{aberto === "novo" ? "Cancelar" : "📅 Agendar audiência / coleta"}</button></div>
      {aberto && <div style={{ padding: "0 14px 12px" }}><FormAgendar numero={numero} av={aberto !== "novo" ? avisos.get(aberto) : undefined} onFim={fechar} /></div>}
      {lista.length ? <div className="rows">{lista.map((a) => <LinhaAto key={a.id} a={a} onEditar={() => setForm(a.id)} />)}</div>
        : !aberto && <div className="empty" style={{ padding: "10px 14px" }}>Nenhuma audiência ou coleta agendada neste processo.</div>}
    </section>
  );
}

/** caixa de Meus expedientes: audiências e coletas ainda não realizadas (de toda a equipe) */
export function CaixaAgenda({ onAbrir, recolhida, onRecolher }: { onAbrir?: () => void; recolhida?: boolean; onRecolher?: () => void } = {}) {
  const { avisos, v } = useDados(); const j = useJanelas();
  const [verFeitos, setVerFeitos] = useState(false); const [filtro, setFiltro] = useState<"" | "avisados" | "confirmados" | "aguardando" | "naoEnviada">("");
  // resumo numa linha: das próximas (não realizadas), quantos clientes foram avisados, quantos faltam confirmar e quantas mensagens faltam
  const proximas = useMemo(() => [...avisos.values()].filter((a) => ehAgenda(a) && !a.realizado_em), [avisos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const conta = { avisados: proximas.filter((a) => a.status === "avisado").length, aguardando: proximas.filter((a) => a.status === "avisado" && !a.confirmado_em).length, confirmados: proximas.filter((a) => a.status === "avisado" && !!a.confirmado_em).length, naoEnviada: proximas.filter((a) => a.status === "pendente").length };
  const passa = (a: Aviso) => !filtro || (filtro === "avisados" ? a.status === "avisado" : filtro === "aguardando" ? a.status === "avisado" && !a.confirmado_em : filtro === "confirmados" ? a.status === "avisado" && !!a.confirmado_em : a.status === "pendente");
  const lista = useMemo(() => [...avisos.values()].filter((a) => ehAgenda(a) && (verFeitos ? !!a.realizado_em : !a.realizado_em && passa(a)))
    .sort((a, b) => verFeitos ? (b.realizado_em || "").localeCompare(a.realizado_em || "") : (a.data_evento || "9").localeCompare(b.data_evento || "9")), [avisos, verFeitos, filtro, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const feitos = useMemo(() => [...avisos.values()].filter((a) => ehAgenda(a) && a.realizado_em).length, [avisos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={"panel agenda" + (recolhida ? " recolhida" : "")} id="sec-agenda">
      <div className="ph"><h3>Audiências e coletas</h3><span className="muted" style={{ fontSize: 12 }}>{verFeitos ? "já realizadas" : "de toda a equipe · agende pela publicação ou dentro do processo"}</span>
        <button className="btn" style={{ marginLeft: "auto" }} title="Agendar uma audiência ou coleta de padrão grafotécnico" onClick={() => j.agendarAto()}><span aria-hidden="true">📅</span> Agendar</button>
        {onAbrir && <button className="btn ghost" onClick={onAbrir} title="Abrir na tela inteira" aria-label="Abrir a caixa Audiências e coletas em tela inteira"><span aria-hidden="true">⤢</span> Abrir caixa</button>}
        {onRecolher && <button className="btn ghost rec-btn" onClick={onRecolher} aria-expanded={!recolhida} aria-controls="sec-agenda" aria-label={(recolhida ? "Expandir a caixa Audiências e coletas" : "Minimizar a caixa Audiências e coletas") + (recolhida && lista.length ? `, ${lista.length} agendamento(s)` : "")} title={recolhida ? "Mostrar o conteúdo desta caixa" : "Esconder o conteúdo desta caixa (fica lembrado neste navegador)"}>{recolhida ? <>{lista.length > 0 && <span className="count" aria-hidden="true">{lista.length}</span>}<span aria-hidden="true">▸</span> Expandir</> : <><span aria-hidden="true">▾</span> Minimizar</>}</button>}</div>
      {!recolhida && (proximas.length > 0 || feitos > 0) && <div className="ag-resumo" role="group" aria-label="Resumo dos agendamentos (clique para filtrar)">
        {([["", proximas.length, proximas.length === 1 ? "agendamento" : "agendamentos", ""], ["avisados", conta.avisados, conta.avisados === 1 ? "cliente avisado" : "clientes avisados", "ok"],
          ["confirmados", conta.confirmados, conta.confirmados === 1 ? "cliente confirmou" : "clientes confirmaram", "ok"], ["aguardando", conta.aguardando, "aguardando confirmação", "soon"], ["naoEnviada", conta.naoEnviada, conta.naoEnviada === 1 ? "mensagem não enviada" : "mensagens não enviadas", "late"]] as const).map(([k, n, rot, cor]) =>
          <button key={k || "todos"} className={"ag-num " + cor + (!verFeitos && filtro === k ? " on" : "")} aria-pressed={!verFeitos && filtro === k} disabled={!n && k !== ""}
            title={k ? "Mostrar só estes" : "Mostrar todas as próximas"} onClick={() => { setVerFeitos(false); setFiltro(filtro === k ? "" : k); }}><b>{n}</b>{rot}</button>)}
        <button className={"ag-num" + (verFeitos ? " on" : "")} aria-pressed={verFeitos} disabled={!feitos && !verFeitos} title="Mostrar os já realizados" onClick={() => { setFiltro(""); setVerFeitos(!verFeitos); }}><b>{feitos}</b>{feitos === 1 ? "realizado" : "realizados"}</button>
      </div>}
      {lista.length ? <div className="rows">{lista.map((a) => <LinhaAto key={a.id} a={a} comCliente />)}</div> : <div className="empty">{filtro && !verFeitos ? <>Nenhum agendamento neste filtro. <button className="reflink" onClick={() => setFiltro("")}>Ver todos</button></> : verFeitos ? "Nada realizado ainda." : <><strong>Nenhuma audiência ou coleta agendada.</strong>Na publicação que marcou o ato, ou dentro do processo, clique em “Agendar audiência / coleta”.</>}</div>}
    </section>
  );
}
