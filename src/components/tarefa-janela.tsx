"use client";
// Tarefa aberta numa caixa (no estilo do ADVBOX): à esquerda a tarefa, as ações e a conversa;
// à direita o processo, as partes com WhatsApp e e-mail, e a publicação que gerou o prazo.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataBR, dataHoraBR, foneWhatsapp, iniciais, nomeBonito } from "@/lib/formato";
import { hojeBR, isoData, paraData, proximoDiaUtil, situacaoPrazo } from "@/lib/prazos";
import { PROTOCOLO_ACAO, STATUS_NOME, atoPub, destinoProtocolo, faseCRM } from "@/lib/regras";
import type { Evento, Publicacao, Tarefa } from "@/lib/tipos";
import { FormEdicao, FormRevisao, ListaAnexos, useAcoesTarefa } from "./tarefas";
import { CorpoEvento } from "./processo";
import { useJanelas } from "./janelas";
import { ProtocolarCaso } from "./FichaCliente";
import { BlocoAviso, ConfirmacaoCliente, useCriarAviso } from "./avisos";
import { Avatar, Ic, RostoOuIniciais, SelResp, useConfirmar } from "./ui";

const diaSemana = (iso?: string | null) => (iso ? paraData(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long" }).split("-")[0] + ", " + dataBR(iso) : "—");
function haQuanto(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `há ${m} min`; const h = Math.round(m / 60); if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24); return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
const S = (d: string) => <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;

export function JanelaTarefa({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { tarefas, processos, clientes, casos, anexos, avisos, sb, eu, titular, nome, aviso, registrar } = useDados(); const j = useJanelas();
  const acoes = useAcoesTarefa(); const confirmar = useConfirmar();
  const t = tarefas.get(id);
  const [form, setForm] = useState<"" | "enviar" | "devolver" | "editar" | "protocolo" | "aprovar">(""); const [prot, setProt] = useState({ numero: "", obs: "" }); const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<"atividade" | "historico">("atividade");
  const [protAte, setProtAte] = useState(() => isoData(proximoDiaUtil(paraData(hojeBR()))));
  const [evs, setEvs] = useState<Evento[]>([]); const [pub, setPub] = useState<Publicacao | null>(null); const [txt, setTxt] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", k); document.body.classList.add("sem-rolagem");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("sem-rolagem"); };
  }, [onFechar]);
  useEffect(() => {
    sb.from("eventos").select("*").eq("tarefa_id", id).order("em").then(({ data }: { data: unknown }) => setEvs((data as Evento[]) || []));
  }, [id, sb, t?.status, t?.editado_em, t?.protocolo_avisado_em]);
  useEffect(() => {
    if (t?.publicacao_id) sb.from("publicacoes").select("id,data,tipo_doc,tipo_com,orgao,link,processo_numero").eq("id", t.publicacao_id).maybeSingle().then(({ data }: { data: unknown }) => setPub(data as Publicacao | null));
  }, [t?.publicacao_id, sb]);
  if (!t) return <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}><div className="modal" style={{ height: "auto" }}><div className="empty">Tarefa não encontrada (talvez tenha sido excluída). <button className="reflink" onClick={onFechar}>Fechar</button></div></div></div>;
  const p = t.processo_numero ? processos.get(t.processo_numero) : undefined; const caso = t.caso_id ? casos.get(t.caso_id) : undefined;
  const cli = p?.cliente_id ? clientes.get(p.cliente_id) : caso?.cliente_id ? clientes.get(caso.cliente_id) : undefined;
  const done = t.status === "feito"; const souResp = t.responsavel === eu.id; const souRev = t.status === "revisao" && t.revisor === eu.id;
  const dest = destinoProtocolo(t, eu.id); const podeEditar = titular || t.criado_por === eu.id; const s = situacaoPrazo(t.vencimento);
  const alterna = (x: typeof form) => setForm(form === x ? "" : x);
  const aprovar = async () => { setSalvando(true); try { if (await acoes.aprovar(t, protAte)) setForm(""); } finally { setSalvando(false); } };
  const ehProtocolo = t.tipo === "Protocolo da inicial" || t.tipo === "Protocolo da peça";
  const podeProtocolar = souResp && !t.protocolo_avisado_em && !["revisao", "ajustes"].includes(t.status);
  const registrarProtocolo = async () => {
    if (!prot.numero.trim() && !confirmar("p" + t.id, aviso, "Sem o nº do protocolo? Clique de novo em “Registrar” para salvar assim mesmo.")) return;
    setSalvando(true); const ok = await acoes.protocolo(t, true, prot.numero, prot.obs); setSalvando(false);
    if (ok) { setForm(""); setProt({ numero: "", obs: "" }); }
  };
  const comentar = async () => {
    const v = txt.trim(); if (!v) return; setTxt("");
    const ev = await registrar({ processo_numero: t.processo_numero, caso_id: t.processo_numero ? null : t.caso_id, tarefa_id: t.id, tipo: "comentario", dados: { texto: v.slice(0, 4000) } });
    if (ev) setEvs((l) => [...l, ev]); else { setTxt(v); aviso("O comentário não foi salvo. Tente de novo."); }
  };
  const comentarios = evs.filter((e) => e.tipo === "comentario").slice().reverse();
  const historico = evs.filter((e) => e.tipo !== "comentario").slice().reverse();
  const wa = foneWhatsapp(cli?.telefone);
  const situacao = done ? <span className="pill ok">Cumprida{t.feito_em ? " em " + dataHoraBR(t.feito_em) : ""}</span>
    : <><span className={"pill " + (t.status === "aberto" ? s.cor : t.status === "aprovada" ? "ok" : t.status === "andamento" ? "acc" : "soon")}>{STATUS_NOME[t.status]}</span> <span className={"pill " + s.cor}>{s.texto}</span></>;
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal largo tj" role="dialog" aria-modal="true" aria-label={"Tarefa: " + t.descricao}>
        <div className="tj-barra">
          {souResp && t.status !== "revisao" && <button className={done ? "btn" : "btn primary"} onClick={() => acoes.status(t, done ? "aberto" : "feito")}>{done ? "↺ Reabrir" : "✓ Concluir"}</button>}
          {souResp && t.status === "aberto" && <button className="btn" onClick={() => acoes.status(t, "andamento")}>Iniciar</button>}
          {souResp && !done && t.status !== "revisao" && <button className="btn" onClick={() => alterna("enviar")}>{form === "enviar" ? "Cancelar envio" : "Enviar p/ correção"}</button>}
          {souRev && <button className="btn primary" onClick={() => alterna("aprovar")}>{form === "aprovar" ? "Cancelar" : "Aprovar"}</button>}
          {souRev && <button className="btn" onClick={() => alterna("devolver")}>{form === "devolver" ? "Cancelar" : "Devolver com ajustes"}</button>}
          {podeProtocolar && <button className={t.status === "aprovada" ? "btn primary" : "btn"} onClick={() => alterna("protocolo")}>{form === "protocolo" ? "Cancelar protocolo" : <>{S('<path d="M4 10.5l4 4 8-9"/>')}Protocolado</>}</button>}
          {t.processo_numero && !done && (souResp || souRev || titular) && <button className="btn" onClick={() => j.gerarPeca({ numero: t.processo_numero!, publicacaoId: t.publicacao_id, tarefaId: t.id, tipo: t.tipo })}>{Ic.claude}Gerar petição</button>}
          <button className="btn ghost" onClick={async () => { const u = location.origin + "/agenda?tarefa=" + t.id; try { await navigator.clipboard.writeText(u); aviso("Link da tarefa copiado."); } catch { aviso(u); } }}>{S('<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9"/>')}Copiar link</button>
          {podeEditar && !done && <button className="btn ghost" onClick={() => alterna("editar")}>{S('<path d="M13.5 3.5l3 3L7 16H4v-3z"/>')}{form === "editar" ? "Fechar edição" : "Editar"}</button>}
          {podeEditar && <button className="btn ghost" onClick={() => { if (confirmar("x" + t.id, aviso, "Clique de novo em “Excluir” para confirmar.")) { acoes.excluir(t); onFechar(); } }}>{S('<path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/>')}Excluir</button>}
          <button className="icb tj-x" title="Fechar" aria-label="Fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="tj-corpo">
          <div className="tj-esq">
            <h2 className="tj-tit">{t.urgente && <span className="selo urg">Urgente</span>}{t.importante && <span className="selo imp">Importante</span>}{t.descricao}</h2>
            <dl className="tj-kv">
              <dt>Responsável</dt><dd><span className="chip"><Avatar id={t.responsavel} pequeno />{t.responsavel ? nome(t.responsavel) : "Sem responsável"}</span>
                {!t.responsavel && titular && !done && <SelResp valor={null} vazio="— atribuir a —" onChange={(v) => v && acoes.atribuir(t, v)} />}</dd>
              {t.revisor && <><dt>Corrige</dt><dd><span className="chip"><Avatar id={t.revisor} pequeno />{nome(t.revisor)}</span>{(t.status === "revisao" || t.status === "ajustes") && t.correcao_ate && <span className={"pill " + situacaoPrazo(t.correcao_ate).cor} style={{ marginLeft: 8 }}>{t.status === "revisao" ? "corrigir" : "ajustar"} até {dataBR(t.correcao_ate)}</span>}</dd></>}
              <dt>Situação</dt><dd>{situacao}</dd>
              <dt>Prazo fatal</dt><dd>{S('<rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/>')} {diaSemana(t.vencimento)}{t.dias ? <span className="muted"> · {t.dias} dias úteis</span> : null}</dd>
              <dt>Anexos</dt><dd><ListaAnexos t={t} />{!t.id || <span className="muted s">{""}</span>}</dd>
              <dt>Criado por</dt><dd><span className="chip"><Avatar id={t.criado_por} pequeno />{nome(t.criado_por)}</span> <span className="muted">{dataHoraBR(t.criado_em)} ({haQuanto(t.criado_em)})</span></dd>
              {t.protocolo_avisado_em && <><dt>Protocolo</dt><dd className="tj-prot"><span className="pill ok">✓ protocolado em {dataHoraBR(t.protocolo_avisado_em)}</span>
                {t.protocolo_numero && <span>nº <strong className="mono">{t.protocolo_numero}</strong> <button className="icb-q mini" title="Copiar o nº do protocolo" onClick={async () => { try { await navigator.clipboard.writeText(t.protocolo_numero!); aviso("Nº do protocolo copiado."); } catch { aviso(t.protocolo_numero!); } }}>{S('<rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>')}</button></span>}
                {t.protocolo_obs && <span className="muted" style={{ flexBasis: "100%" }}>“{t.protocolo_obs}”</span>}</dd></>}
            </dl>
            {t.aviso_id && avisos.get(t.aviso_id) && (() => { const av = avisos.get(t.aviso_id!)!; return <div className="tj-corr">
              <div className="tj-corr-h"><strong>Aviso ao cliente</strong><span className="muted s">{av.tipo_evento || "Ato"}{av.data_evento ? " · " + dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : ""}{av.local ? " · " + av.local : ""}</span></div>
              <div className="muted s">Registre aqui o retorno do cliente; ao confirmar, esta conferência é concluída sozinha.</div>
              <ConfirmacaoCliente av={av} />
              <div><button className="reflink" onClick={() => j.abrirAviso(av.id)}>Abrir o aviso (mensagem e WhatsApp)</button></div>
            </div>; })()}
            {t.tipo === "Protocolo da inicial" && <AvisoProtocolo numero={t.processo_numero || caso?.processo_numero || null} />}
            {t.tipo === "Protocolo da inicial" && caso && !caso.processo_numero && !done && <div className="tj-corr">
              <div className="tj-corr-h"><strong>Protocolo da inicial</strong><span className="muted s">a peça e a pasta estão nos anexos acima</span></div>
              <ol className="tj-passos"><li>Protocole no eproc com os arquivos da pasta.</li><li>Cole abaixo o nº do processo: o atendimento vira processo judicial e as publicações passam a ser acompanhadas.</li><li>Depois, “Protocolado” registra o protocolo e conclui esta tarefa.</li></ol>
              <ProtocolarCaso casoId={caso.id} />
            </div>}
            {souRev && <div className="tj-corr">
              <div className="tj-corr-h"><strong>Você está corrigindo esta peça</strong><span className="muted s">enviada por {nome(t.responsavel)}{t.enviado_em ? " em " + dataHoraBR(t.enviado_em) : ""}</span></div>
              <ol className="tj-passos">
                <li>Abra os anexos, na linha “Anexos” acima: clique para ver ao lado; o Word você baixa e corrige.</li>
                <li>Confira a documentação{t.nota_correcao && /[✓✗]/.test(t.nota_correcao) ? " pela lista do recado" : ""}{(cli || caso) ? <> ou abra a <button className="reflink" onClick={() => j.abrirInicial({ clienteId: cli?.id || null, banco: p?.banco || caso?.banco || "", numero: t.processo_numero, casoId: t.caso_id })}>pasta para protocolo</button></> : null}.</li>
                <li><b>Aprovar</b> {t.tipo === "Elaboração de inicial" && !t.processo_numero ? "cria a tarefa “Protocolo da inicial” para " : "cria a tarefa de protocolo (com a data que você escolher) para "}{nome(t.responsavel).split(" ")[0]}; <b>Devolver com ajustes</b> manda de volta com o seu recado e, se quiser, a versão corrigida.</li>
              </ol>
              <div className="tools"><button className="btn primary" onClick={() => alterna("aprovar")}>{form === "aprovar" ? "Cancelar" : "✓ Aprovar"}</button><button className="btn" onClick={() => alterna("devolver")}>{form === "devolver" ? "Cancelar" : "Devolver com ajustes"}</button></div>
            </div>}
            {t.nota_correcao && ["revisao", "ajustes"].includes(t.status) && <div className="ai tj-nota"><span className="muted">{t.status === "revisao" ? "Recado de quem enviou:" : "Ajustes pedidos:"}</span>
              <div>{t.nota_correcao.split("\n").map((l, i) => <div key={i} className={/^✓/.test(l) ? "ok-l" : /^✗/.test(l) ? "falta-l" : ""}>{l || "\u00a0"}</div>)}</div></div>}
            {!souResp && !souRev && !done && t.responsavel && <div className="muted" style={{ fontSize: 12.5 }}>Só {nome(t.responsavel)} pode iniciar ou concluir esta tarefa.</div>}
            {form === "enviar" && <FormRevisao t={t} modo="enviar" onFim={() => setForm("")} />}
            {form === "devolver" && <FormRevisao t={t} modo="devolver" onFim={() => setForm("")} />}
            {form === "aprovar" && <div className="triage edit-t">
              <div className="wide" style={{ fontWeight: 600 }}>Aprovar {ehProtocolo ? "" : "e criar a tarefa de protocolo"}</div>
              {!ehProtocolo && <label className="f">Protocolar até<input type="date" value={protAte} min={hojeBR()} onChange={(e) => setProtAte(e.target.value)} /></label>}
              <div className="muted wide" style={{ fontSize: 12.5 }}>{ehProtocolo ? "" : `Cria a tarefa “${t.tipo === "Elaboração de inicial" && !t.processo_numero ? "Protocolo da inicial" : "Protocolar"}” para ${nome(t.responsavel).split(" ")[0]}, com a peça ${[...anexos.values()].some((a) => a.tarefa_id === t.id && a.etapa === "devolucao") ? "corrigida" : "enviada"} anexada, vencendo no dia escolhido.`}{t.vencimento ? ` Prazo fatal da peça: ${dataBR(t.vencimento)}.` : ""}{t.vencimento && protAte > t.vencimento ? " Atenção: a data escolhida passa do prazo fatal." : ""}</div>
              <div className="wide tools"><button className="btn primary" disabled={salvando} onClick={aprovar}>{salvando ? "Aprovando…" : "✓ Confirmar aprovação"}</button></div>
            </div>}
            {form === "editar" && <FormEdicao t={t} onFim={() => setForm("")} />}
            {form === "protocolo" && <div className="triage edit-t">
              <div className="wide" style={{ fontWeight: 600 }}>Informar o protocolo{dest ? " a " + nome(dest) : ""}</div>
              <label className="f wide">Nº do protocolo / evento no eproc<input autoFocus value={prot.numero} placeholder="ex.: evento 52 · protocolo 7200123456789" onChange={(e) => setProt({ ...prot, numero: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); registrarProtocolo(); } }} /></label>
              <label className="f wide">Observação (opcional)<textarea rows={2} value={prot.obs} placeholder="ex.: juntei também o comprovante de residência" onChange={(e) => setProt({ ...prot, obs: e.target.value })} /></label>
              <div className="muted wide" style={{ fontSize: 12.5 }}>A data e o horário ficam registrados no momento do clique. O protocolo aparece nesta tarefa e na linha do tempo do processo{dest ? `, e ${nome(dest).split(" ")[0]} recebe o aviso no sino` : ""}.</div>
              <div className="tools wide"><button className="btn primary" disabled={salvando} onClick={registrarProtocolo}>{salvando ? "Registrando…" : done ? "Registrar protocolo" : "Registrar protocolo e concluir"}</button>
                <button className="btn ghost" onClick={() => setForm("")}>Cancelar</button></div>
            </div>}
            <div className="tj-abas" role="tablist">
              <button role="tab" aria-selected={aba === "atividade"} onClick={() => setAba("atividade")}>Atividade{comentarios.length ? ` (${comentarios.length})` : ""}</button>
              <button role="tab" aria-selected={aba === "historico"} onClick={() => setAba("historico")}>Histórico completo</button>
            </div>
            {aba === "atividade" ? <>
              <div className="tj-comp">
                <textarea rows={3} value={txt} placeholder={`Adicione um comentário para ${t.responsavel && t.responsavel !== eu.id ? nome(t.responsavel).split(" ")[0] : "a equipe"}…  (Ctrl+Enter envia)`} onChange={(e) => setTxt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); comentar(); } }} />
                <div className="tools"><button className="btn primary" onClick={comentar}>Comentar</button><span className="muted" style={{ fontSize: 12 }}>O comentário fica na tarefa e na linha do tempo do processo; o Claude também lê ao gerar a petição.</span></div>
              </div>
              <div className="tlw" style={{ padding: 0 }}>{comentarios.length ? comentarios.map((e) => (
                <div key={e.id} className={"tl com" + (e.por === eu.id ? " meu" : "")}><div className="av"><RostoOuIniciais id={e.por} /></div>
                  <div className="bub"><div className="bh"><strong>{nome(e.por)}</strong> · {dataHoraBR(e.em)}</div><CorpoEvento e={e} nome={nome} /></div></div>)) : <div className="muted" style={{ fontSize: 13 }}>Nenhum comentário ainda.</div>}</div>
            </> : <div className="tlw" style={{ padding: 0 }}>{historico.length ? historico.map((e) => (
              <div key={e.id} className="tl"><div className={"av" + (e.por ? "" : " sys")}>{e.por ? <RostoOuIniciais id={e.por} /> : "—"}</div>
                <div className="bub"><div className="bh"><strong>{e.por ? nome(e.por) : "Sistema"}</strong> · {dataHoraBR(e.em)}</div><CorpoEvento e={e} t={t} nome={nome} /></div></div>)) : <div className="muted" style={{ fontSize: 13 }}>Sem histórico.</div>}</div>}
          </div>
          <aside className="tj-dir">
            {p ? <>
              <div className="tj-bloco"><div className="tj-rot">Processo</div>
                <div className="mono">{p.mascara} <button className="icb-q mini" title="Copiar o número" onClick={async () => { try { await navigator.clipboard.writeText(p.mascara); aviso("Número copiado."); } catch { aviso(p.mascara); } }}>{S('<rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>')}</button></div>
                <button className="reflink" onClick={() => j.abrirProcesso(p.numero, { aba: "tarefas", alvo: "tar-" + t.id })}>Visualizar processo</button></div>
              <div className="tj-bloco"><div className="tj-rot">Partes envolvidas</div>
                <div style={{ fontWeight: 600 }}>{nomeBonito(cli?.nome || p.cliente_nome || "—")}</div>
                {wa && <a className="tj-wa" href={"https://wa.me/" + wa} target="_blank" rel="noopener noreferrer">{S('<path d="M4 16l1-3.2A6.5 6.5 0 1 1 7.3 15z"/>')}{cli?.telefone}</a>}
                {cli?.email && <div className="s">{cli.email} <button className="icb-q mini" title="Copiar e-mail" onClick={async () => { try { await navigator.clipboard.writeText(cli.email!); aviso("E-mail copiado."); } catch { aviso(cli.email!); } }}>{S('<rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>')}</button></div>}
                {cli && <Link className="reflink" href={"/clientes/" + cli.id} onClick={onFechar}>Ficha do cliente</Link>}
                {(p.reus || []).map((r, i) => <div key={i} className="s" style={{ color: "var(--fg)" }}>{i === 0 ? "vs " : ""}{nomeBonito(r)}</div>)}</div>
              <div className="tj-bloco"><div className="tj-rot">Juízo</div><div>{p.orgao || "—"}</div>{p.classe && <div className="s">{nomeBonito(p.classe)}</div>}
                {pub?.link && <a className="reflink" href={pub.link} target="_blank" rel="noopener noreferrer">Visualizar no tribunal ↗</a>}</div>
              {faseCRM(p.fase) && <div className="tj-bloco"><div className="tj-rot">Fase</div><div>{faseCRM(p.fase)}</div></div>}
              {pub && <div className="tj-bloco"><div className="tj-rot">Publicação que gerou o prazo</div><div>{atoPub(pub)} · {dataBR(pub.data)}</div>
                <button className="reflink" onClick={() => j.abrirProcesso(p.numero, { aba: "intimacoes", alvo: "pub-" + pub.id })}>Ver a publicação</button></div>}
              <div className="tj-bloco"><div className="tj-rot">Responsável pelo processo</div><span className="chip"><Avatar id={p.responsavel} pequeno />{p.responsavel ? nome(p.responsavel) : "Sem responsável"}</span></div>
              <div className="tj-bloco"><div className="tj-rot">Réu principal</div><div>{bancoCurto(p.banco)}</div></div>
            </> : caso ? <>
              <div className="tj-bloco"><div className="tj-rot">Atendimento pré-processual</div><div style={{ fontWeight: 600 }}>{nomeBonito(caso.nome)}</div><div className="s">x {caso.banco || "banco a definir"}</div><div className="s">Etapa: {caso.etapa}</div>
                <button className="reflink" onClick={() => j.abrirCaso(caso.id)}>Abrir atendimento</button></div>
              {cli && <div className="tj-bloco"><div className="tj-rot">Cliente</div>{wa && <a className="tj-wa" href={"https://wa.me/" + wa} target="_blank" rel="noopener noreferrer">{cli.telefone}</a>}{cli.email && <div className="s">{cli.email}</div>}</div>}
            </> : <div className="muted">Tarefa sem processo.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** depois do protocolo da inicial: avisar o cliente (número do processo, juízo), na caixa padrão de aviso */
function AvisoProtocolo({ numero }: { numero: string | null }) {
  const { avisos, processos } = useDados(); const criar = useCriarAviso(); const [criando, setCriando] = useState(false);
  if (!numero || !processos.get(numero)) return <div className="tj-corr min"><div className="tj-corr-h"><strong>Avisar o cliente</strong><span className="muted s">depois de colar o nº do processo, a mensagem ao cliente aparece aqui</span></div></div>;
  const av = [...avisos.values()].find((a) => a.processo_numero === numero && a.tipo_evento === PROTOCOLO_ACAO);
  if (av) return <BlocoAviso av={av} inicioAberto={av.status !== "avisado" && av.status !== "dispensado"} />;
  return <div className="tj-corr">
    <div className="tj-corr-h"><strong>Avisar o cliente do protocolo</strong><span className="muted s">mensagem com o nº do processo e o juízo, pelo WhatsApp</span></div>
    <div className="tools"><button className="btn primary" disabled={criando} onClick={async () => { setCriando(true); await criar({ processo_numero: numero, tipo_evento: PROTOCOLO_ACAO, data_evento: hojeBR() }); setCriando(false); }}>{criando ? "Abrindo…" : "Avisar o cliente"}</button></div>
  </div>;
}
