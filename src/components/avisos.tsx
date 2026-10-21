"use client";
// Avisar o cliente de perícia, audiência ou coleta de assinatura, pelo WhatsApp.
import { useEffect, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR, foneWhatsapp, nomeBonito } from "@/lib/formato";
import { MODALIDADES, TIPOS_EV, ehAgenda, mensagemPadrao } from "@/lib/regras";
import { diferencaDias, hojeBR, isoData, paraData, proximoDiaUtil, somaDias } from "@/lib/prazos";
import type { Modalidade } from "@/lib/tipos";
import type { Aviso } from "@/lib/tipos";

/** cria (ou devolve o que já existe para a publicação) um aviso ao cliente */
export function useCriarAviso() {
  const { sb, avisos, aplicar, registrar, aviso } = useDados();
  return async (base: Partial<Aviso> & { processo_numero: string }): Promise<string | null> => {
    if (base.publicacao_id) { const ja = [...avisos.values()].find((a) => a.publicacao_id === base.publicacao_id); if (ja) return ja.id; }
    const { data, error } = await sb.from("avisos_cliente").insert({
      processo_numero: base.processo_numero, publicacao_id: base.publicacao_id ?? null, tipo_evento: base.tipo_evento || null, data_evento: base.data_evento || null,
      hora: base.hora || null, local: base.local || null, orientacoes: base.orientacoes || null,
      ...(base.modalidade ? { modalidade: base.modalidade } : {}),
    }).select().single();
    if (error) {
      if (/duplicate/i.test(error.message) && base.publicacao_id) {
        const { data: ex } = await sb.from("avisos_cliente").select("*").eq("publicacao_id", base.publicacao_id).single();
        if (ex) { aplicar("avisos", ex); return ex.id; }
      }
      aviso(msgErro(error)); return null;
    }
    aplicar("avisos", data);
    registrar({ processo_numero: base.processo_numero, publicacao_id: base.publicacao_id ?? null, tipo: "aviso_criado", dados: { texto: (base.tipo_evento || "Ato") + (base.data_evento ? " em " + dataBR(base.data_evento) : "") } });
    return data.id;
  };
}

/** endereço do Atende Direito com os dados do cliente no lugar de {cpf}, {nome}, {telefone} e {processo} */
export function urlAtende(modelo: string, d: { cpf?: string | null; nome?: string | null; telefone?: string; processo?: string }) {
  if (!modelo) return "";
  return modelo.replace(/\{cpf\}/g, encodeURIComponent((d.cpf || "").replace(/\D/g, ""))).replace(/\{nome\}/g, encodeURIComponent(d.nome || ""))
    .replace(/\{processo\}/g, encodeURIComponent(d.processo || "")).replace(/\{telefone\}/g, encodeURIComponent(d.telefone || ""));
}

export function BlocoAviso({ av, inicioAberto }: { av: Aviso; inicioAberto?: boolean }) {
  const { sb, processos, clientes, config, aplicar, registrar, aviso, nome, eu } = useDados();
  const p = processos.get(av.processo_numero); const cli = p?.cliente_id ? clientes.get(p.cliente_id) : undefined;
  const feito = av.status === "avisado"; const dispensado = av.status === "dispensado";
  const [min, setMin] = useState(inicioAberto ? false : av.status !== "pendente");
  const padrao = mensagemPadrao(av, cli?.nome || p?.cliente_nome || "", p?.banco);
  const [texto, setTexto] = useState(av.mensagem || padrao); const [mexeu, setMexeu] = useState(!!av.mensagem);
  const [fone, setFone] = useState(cli?.telefone || "");
  // o que está digitado nos campos (pode ainda não ter sido gravado) vai para o Claude
  const tela = useRef<Record<string, string>>({}); const anota = (k: string) => (e: { target: { value: string } }) => { tela.current[k] = e.target.value; };
  const [escrevendo, setEscrevendo] = useState(false); const [alertas, setAlertas] = useState<string[]>([]);
  const escreverClaude = async () => {
    setEscrevendo(true); setAlertas([]);
    try {
      const r = await fetch("/api/claude/mensagem", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ avisoId: av.id, ...tela.current, mensagemAtual: texto }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(j.erro || "Não consegui escrever a mensagem agora."); return; }
      setTexto(j.mensagem); setMexeu(true); setAlertas(j.alertas || []);
      salvar({ mensagem: j.mensagem });
      aviso("Mensagem escrita pelo Claude. Confira antes de enviar.");
    } finally { setEscrevendo(false); }
  };
  useEffect(() => { if (!mexeu) setTexto(padrao); }, [padrao, mexeu]);
  useEffect(() => { if (!fone && cli?.telefone) setFone(cli.telefone); }, [cli?.telefone]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async (campos: Partial<Aviso>) => {
    const { data, error } = await sb.from("avisos_cliente").update(campos).eq("id", av.id).select().single();
    if (error) aviso(msgErro(error)); else aplicar("avisos", data);
  };
  const resumo = [av.tipo_evento || "Ato a definir", av.data_evento ? dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : "", av.local].filter(Boolean).join(" · ");
  const wa = foneWhatsapp(fone);
  const atende = urlAtende(config.geral?.atendeUrl || "", { cpf: cli?.cpf, nome: cli?.nome || p?.cliente_nome, telefone: wa, processo: p?.mascara });
  const ac = useAcompanhamentoAviso();
  const marcar = async (sim: boolean) => {
    await salvar(sim ? { status: "avisado", avisado_em: new Date().toISOString(), avisado_por: eu.id, canal: "WhatsApp", mensagem: texto } : { status: "pendente", avisado_em: null, avisado_por: null, canal: null });
    registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: sim ? "cliente_avisado" : "aviso_reaberto", dados: { texto: (av.tipo_evento || "Ato") + (av.data_evento ? " em " + dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : "") } });
    const n = sim ? await ac.criarTarefas({ ...av, status: "avisado" }) : 0;
    aviso(sim ? "Registrado: cliente avisado." + (n ? ` Criei ${n === 1 ? "a tarefa" : n + " tarefas"} de acompanhamento (confirmar amanhã${n > 1 ? " e lembrar 3 dias antes" : ""}).` : "") : "Aviso voltou para pendente.");
    if (sim) setMin(true);
  };
  const dispensar = async () => {
    const { data, error } = await sb.from("avisos_cliente").update({ status: "dispensado" }).eq("id", av.id).select().single();
    if (error) { aviso(/check/i.test(error.message) ? "Falta instalar a etapa 0012 (0012_aviso_dispensado.sql) no Supabase." : msgErro(error)); return; }
    aplicar("avisos", data); registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "aviso_dispensado", dados: { texto: "Não precisa avisar o cliente" } });
    aviso("Marcado: não precisa avisar o cliente."); setMin(true);
  };
  const topo = (
    <div className="av-top">
      <button className="av-tit" onClick={() => setMin(!min)} aria-expanded={!min}><span className="seta">{min ? "▸" : "▾"}</span><strong>{feito ? "Cliente avisado" : dispensado ? "Sem aviso ao cliente" : "Avisar o cliente"}</strong></button>
      <span className="tools">{feito ? <span className="pill ok">{(av.canal || "WhatsApp") + " · " + nome(av.avisado_por) + " · " + dataHoraBR(av.avisado_em)}</span> : dispensado ? <span className="pill">não precisa avisar</span> : <span className="pill soon">pendente</span>}
        {feito && <PillConfirmacao av={av} />}
        {(feito || dispensado) && <button className="btn" onClick={() => marcar(false)} title="O aviso volta para pendente">↺ Voltar para não avisado</button>}
        <button className="btn ghost" onClick={() => setMin(!min)}>{min ? "Expandir" : "Minimizar"}</button></span>
    </div>
  );
  if (min) return <div className={"aviso-cli min" + (feito ? " ok" : "")}>{topo}<div className="muted" style={{ fontSize: 12.5 }}>{resumo}</div><ConfirmacaoCliente av={av} /></div>;
  return (
    <div className={"aviso-cli" + (feito ? " ok" : "")}>
      {topo}
      <div className="triage">
        <label className="f">O que foi marcado<select value={av.tipo_evento || ""} onChange={(e) => salvar({ tipo_evento: e.target.value || null })}><option value="">— escolher —</option>{TIPOS_EV.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="f wide2">Como vai ser<select value={av.modalidade || ""} onChange={(e) => salvar({ modalidade: (e.target.value || null) as Modalidade | null })}><option value="">— não se aplica —</option>{(Object.keys(MODALIDADES) as Modalidade[]).map((k) => <option key={k} value={k}>{MODALIDADES[k].nome}</option>)}</select></label>
        <label className="f">{av.modalidade === "jf_balcao" ? "Até o dia" : "Data"}<input type="date" defaultValue={av.data_evento || ""} onChange={anota("data_evento")} onBlur={(e) => { if (e.target.value !== (av.data_evento || "")) { salvar({ data_evento: e.target.value || null }); ac.ajustarLembrete(av, e.target.value || null); } }} /></label>
        <label className="f">Hora<input type="time" defaultValue={(av.hora || "").slice(0, 5)} onChange={anota("hora")} onBlur={(e) => e.target.value !== (av.hora || "").slice(0, 5) && salvar({ hora: e.target.value || null })} /></label>
        {av.modalidade === "video" && <label className="f wide2">Link da sala virtual<input defaultValue={av.link || ""} placeholder="https://…" onChange={anota("link")} onBlur={(e) => e.target.value !== (av.link || "") && salvar({ link: e.target.value.trim() || null })} /></label>}
        {av.modalidade !== "video" && <label className="f wide2">Local<input defaultValue={av.local || ""} placeholder="Ex.: secretaria da 6ª Vara Federal de Joinville" onChange={anota("local")} onBlur={(e) => e.target.value !== (av.local || "") && salvar({ local: e.target.value || null })} /></label>}
        <label className="f wide">Orientações ao cliente<input defaultValue={av.orientacoes || ""} placeholder="Ex.: levar documento com foto; a coleta leva cerca de 1 hora" onChange={anota("orientacoes")} onBlur={(e) => e.target.value !== (av.orientacoes || "") && salvar({ orientacoes: e.target.value || null })} /></label>
      </div>
      <label className="f">Mensagem<textarea rows={6} value={texto} onChange={(e) => { setTexto(e.target.value); setMexeu(true); }} /></label>
      <div className="tools">
        <button className="btn" disabled={escrevendo} onClick={escreverClaude} title="O Claude confere o local, as orientações e a publicação e escreve a mensagem">{escrevendo ? "O Claude está escrevendo…" : "✨ Escrever mensagem com o Claude"}</button>
        {mexeu && <button className="reflink" onClick={() => { setMexeu(false); setTexto(padrao); setAlertas([]); }}>Voltar à mensagem padrão</button>}
      </div>
      {alertas.length > 0 && <div className="banner"><strong>O Claude pede para conferir:</strong><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
      <div className="tools">
        <label className="f" style={{ flex: 1, minWidth: 180 }}>WhatsApp do cliente{cli ? "" : " (processo sem ficha de cliente)"}<input type="tel" value={fone} placeholder="(47) 9 9999-9999" onChange={(e) => setFone(e.target.value)} /></label>
        {cli && fone && fone !== (cli.telefone || "") && <button className="btn ghost" style={{ alignSelf: "flex-end" }} onClick={async () => {
          const { data, error } = await sb.from("clientes").update({ telefone: fone }).eq("id", cli.id).select().single();
          if (error) aviso(msgErro(error)); else { aplicar("clientes", data); aviso("Telefone salvo na ficha."); }
        }}>Salvar na ficha</button>}
      </div>
      <div className="tools">
        <a className="btn wa" href={wa ? "https://wa.me/" + wa + "?text=" + encodeURIComponent(texto) : "#"} target="_blank" rel="noopener noreferrer"
          onClick={(e) => { if (!wa) { e.preventDefault(); aviso("Informe o WhatsApp do cliente."); return; } salvar({ mensagem: texto, aberto_em: new Date().toISOString() }); }}>Abrir no WhatsApp</a>
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(texto); aviso("Mensagem copiada."); } catch { aviso("Selecione o texto da mensagem e copie."); } }}>Copiar mensagem</button>
        {atende && <a className="btn" href={atende} target="_blank" rel="noopener noreferrer">Abrir no Atende Direito ↗</a>}
        {feito || dispensado ? <button className="btn" onClick={() => marcar(false)}>↺ Voltar para não avisado</button>
          : <><button className="btn primary" onClick={() => marcar(true)}>Marcar como avisado</button><button className="btn ghost" onClick={dispensar} title="Para quando o ato não exige avisar o cliente">Não precisa avisar</button></>}
      </div>
      <ConfirmacaoCliente av={av} />
      {!feito && av.aberto_em && <div className="muted" style={{ fontSize: 12 }}>WhatsApp aberto em {dataHoraBR(av.aberto_em)}. Depois de enviar, marque como avisado.</div>}
    </div>
  );
}

export const nomeDoAviso = (av: Aviso, d: ReturnType<typeof useDados>) => nomeBonito(d.processos.get(av.processo_numero)?.cliente_nome || "—");

/** acompanhamento depois do aviso: tarefas automáticas, confirmação do cliente e dificuldade de contato */
export function useAcompanhamentoAviso() {
  const { sb, eu, tarefas, aplicar, registrar, aviso, nome } = useDados();
  const FALTA = "Falta instalar a etapa 0015 (0015_confirmacao_cliente.sql) no Supabase.";
  const resumo = (av: Aviso) => [av.tipo_evento || "Ato", av.data_evento ? (av.modalidade === "jf_balcao" ? "até " : "") + dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : ""].filter(Boolean).join(" ");
  const tarefasDo = (av: Aviso) => [...tarefas.values()].filter((t) => t.aviso_id === av.id && t.status !== "feito");
  /** ao marcar como avisado: amanhã (dia útil) conferir a confirmação; 3 dias antes do ato, lembrar o cliente */
  const criarTarefas = async (av: Aviso) => {
    const hoje = hojeBR(); const novas: Record<string, unknown>[] = [];
    if (!tarefasDo(av).some((t) => t.tipo === "Verificar retorno do cliente"))
      novas.push({ processo_numero: av.processo_numero, aviso_id: av.id, tipo: "Verificar retorno do cliente", responsavel: eu.id,
        descricao: "Verificar retorno do cliente: confirmou o recebimento e a presença? (" + resumo(av) + ")", vencimento: isoData(proximoDiaUtil(paraData(hoje))) });
    if (av.data_evento && ehAgenda(av) && diferencaDias(av.data_evento, hoje) > 3 && !tarefasDo(av).some((t) => t.tipo === "Contato com o cliente"))
      novas.push({ processo_numero: av.processo_numero, aviso_id: av.id, tipo: "Contato com o cliente", responsavel: eu.id, importante: true,
        descricao: "Contato com o cliente: lembrar do ato daqui a 3 dias (" + resumo(av) + ")", vencimento: isoData(somaDias(paraData(av.data_evento), -3)) });
    if (!novas.length) return 0;
    let r = await sb.from("tarefas").insert(novas).select();
    if (r.error && /aviso_id/.test(r.error.message)) { aviso(FALTA + " As tarefas foram criadas sem ligação com o aviso."); r = await sb.from("tarefas").insert(novas.map(({ aviso_id: _x, ...o }) => o)).select(); }
    if (r.error) { aviso(msgErro(r.error)); return 0; }
    for (const t of r.data || []) aplicar("tarefas", t);
    return (r.data || []).length;
  };
  /** se a data do ato mudar, o lembrete muda junto */
  const ajustarLembrete = async (av: Aviso, novaData: string | null) => {
    for (const t of tarefasDo(av).filter((x) => x.tipo === "Contato com o cliente" && /lembrar do ato/i.test(x.descricao))) {
      if (!novaData) continue;
      const { data } = await sb.from("tarefas").update({ vencimento: isoData(somaDias(paraData(novaData), -3)) }).eq("id", t.id).select().single();
      if (data) aplicar("tarefas", data);
    }
  };
  const concluirVerificacao = async (av: Aviso) => {
    for (const t of tarefasDo(av).filter((x) => x.tipo === "Verificar retorno do cliente" && x.responsavel === eu.id)) {
      const { data } = await sb.from("tarefas").update({ status: "feito" }).eq("id", t.id).select().single(); if (data) aplicar("tarefas", data);
    }
  };
  const confirmou = async (av: Aviso, sim: boolean) => {
    const { data, error } = await sb.from("avisos_cliente").update(sim ? { confirmado_em: new Date().toISOString(), confirmado_por: eu.id, dificuldade: null, dificuldade_em: null } : { confirmado_em: null, confirmado_por: null }).eq("id", av.id).select().single();
    if (error) { aviso(/confirmado/.test(error.message) ? FALTA : msgErro(error)); return false; }
    aplicar("avisos", data);
    if (sim) { await concluirVerificacao(av); registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "comentario", dados: { texto: "Cliente confirmou o recebimento do aviso e a presença: " + resumo(av) + "." } }); }
    aviso(sim ? "Registrado: o cliente confirmou." : "Confirmação desfeita."); return true;
  };
  const dificuldade = async (av: Aviso, texto: string | null) => {
    const { data, error } = await sb.from("avisos_cliente").update(texto ? { dificuldade: texto, dificuldade_em: new Date().toISOString() } : { dificuldade: null, dificuldade_em: null }).eq("id", av.id).select().single();
    if (error) { aviso(/dificuldade/.test(error.message) ? FALTA : msgErro(error)); return false; }
    aplicar("avisos", data);
    if (texto) {
      registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "comentario", dados: { texto: "Dificuldade para encontrar o cliente (" + resumo(av) + "): " + texto } });
      // a conferência da confirmação fica urgente
      for (const t of tarefasDo(av).filter((x) => x.tipo === "Verificar retorno do cliente" && !x.urgente)) { const { data: d2 } = await sb.from("tarefas").update({ urgente: true }).eq("id", t.id).select().single(); if (d2) aplicar("tarefas", d2); }
    }
    aviso(texto ? "Marcado: dificuldade de contato com o cliente." : "Dificuldade de contato desmarcada."); return true;
  };
  return { criarTarefas, ajustarLembrete, confirmou, dificuldade, nome };
}

/** situação do cliente depois do aviso, para mostrar em listas */
export function PillConfirmacao({ av }: { av: Aviso }) {
  if (av.dificuldade) return <span className="pill late" title={av.dificuldade}>⚠ dificuldade de contato</span>;
  if (av.confirmado_em) return <span className="pill ok">✓ cliente confirmou</span>;
  if (av.status === "avisado") return <span className="pill soon">aguardando confirmação</span>;
  return null;
}

/** botões de confirmação e dificuldade (no aviso e na tarefa automática) */
export function ConfirmacaoCliente({ av }: { av: Aviso }) {
  const ac = useAcompanhamentoAviso(); const [nota, setNota] = useState<string | null>(null);
  if (av.status !== "avisado") return null;
  return (
    <div className="conf-cli">
      <div className="conf-st">{av.confirmado_em ? <span className="pill ok">✓ cliente confirmou · {ac.nome(av.confirmado_por).split(" ")[0]} · {dataHoraBR(av.confirmado_em)}</span>
        : <span className="pill soon">aguardando a confirmação do cliente</span>}
        {av.dificuldade && <span className="pill late" title={av.dificuldade}>⚠ dificuldade de contato: {av.dificuldade}</span>}</div>
      <div className="tools">
        {!av.confirmado_em ? <button className="btn primary" onClick={() => ac.confirmou(av, true)}>✓ Cliente confirmou</button> : <button className="btn ghost" onClick={() => ac.confirmou(av, false)}>Desfazer confirmação</button>}
        {!av.dificuldade ? <button className="btn" onClick={() => setNota(nota == null ? "" : null)}>⚠ Dificuldade de contato</button> : <button className="btn ghost" onClick={() => ac.dificuldade(av, null)}>Encontramos o cliente</button>}
      </div>
      {nota != null && !av.dificuldade && <div className="tools"><input style={{ flex: 1, minWidth: 220 }} autoFocus value={nota} placeholder="Ex.: não atende, WhatsApp sem resposta, número errado" onChange={(e) => setNota(e.target.value)}
        onKeyDown={async (e) => { if (e.key === "Enter" && nota.trim() && await ac.dificuldade(av, nota.trim())) setNota(null); }} />
        <button className="btn primary" disabled={!nota.trim()} onClick={async () => { if (await ac.dificuldade(av, nota.trim())) setNota(null); }}>Marcar</button></div>}
    </div>
  );
}
