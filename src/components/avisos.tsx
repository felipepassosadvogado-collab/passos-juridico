"use client";
// Avisar o cliente de perícia, audiência ou coleta de assinatura, pelo WhatsApp.
import { useEffect, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR, foneWhatsapp, nomeBonito } from "@/lib/formato";
import { MODALIDADES, TIPOS_EV, mensagemPadrao } from "@/lib/regras";
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
  const marcar = async (sim: boolean) => {
    await salvar(sim ? { status: "avisado", avisado_em: new Date().toISOString(), avisado_por: eu.id, canal: "WhatsApp", mensagem: texto } : { status: "pendente", avisado_em: null, avisado_por: null, canal: null });
    registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: sim ? "cliente_avisado" : "aviso_reaberto", dados: { texto: (av.tipo_evento || "Ato") + (av.data_evento ? " em " + dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : "") } });
    aviso(sim ? "Registrado: cliente avisado." : "Aviso voltou para pendente.");
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
        {(feito || dispensado) && <button className="btn" onClick={() => marcar(false)} title="O aviso volta para pendente">↺ Voltar para não avisado</button>}
        <button className="btn ghost" onClick={() => setMin(!min)}>{min ? "Expandir" : "Minimizar"}</button></span>
    </div>
  );
  if (min) return <div className={"aviso-cli min" + (feito ? " ok" : "")}>{topo}<div className="muted" style={{ fontSize: 12.5 }}>{resumo}</div></div>;
  return (
    <div className={"aviso-cli" + (feito ? " ok" : "")}>
      {topo}
      <div className="triage">
        <label className="f">O que foi marcado<select value={av.tipo_evento || ""} onChange={(e) => salvar({ tipo_evento: e.target.value || null })}><option value="">— escolher —</option>{TIPOS_EV.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="f wide2">Como vai ser<select value={av.modalidade || ""} onChange={(e) => salvar({ modalidade: (e.target.value || null) as Modalidade | null })}><option value="">— não se aplica —</option>{(Object.keys(MODALIDADES) as Modalidade[]).map((k) => <option key={k} value={k}>{MODALIDADES[k].nome}</option>)}</select></label>
        <label className="f">{av.modalidade === "jf_balcao" ? "Até o dia" : "Data"}<input type="date" defaultValue={av.data_evento || ""} onChange={anota("data_evento")} onBlur={(e) => e.target.value !== (av.data_evento || "") && salvar({ data_evento: e.target.value || null })} /></label>
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
      {!feito && av.aberto_em && <div className="muted" style={{ fontSize: 12 }}>WhatsApp aberto em {dataHoraBR(av.aberto_em)}. Depois de enviar, marque como avisado.</div>}
    </div>
  );
}

export const nomeDoAviso = (av: Aviso, d: ReturnType<typeof useDados>) => nomeBonito(d.processos.get(av.processo_numero)?.cliente_nome || "—");
