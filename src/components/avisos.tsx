"use client";
// Avisar o cliente de perícia, audiência ou coleta de assinatura, pelo WhatsApp.
import { useEffect, useState } from "react";
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
  const feito = av.status === "avisado";
  const [min, setMin] = useState(inicioAberto ? false : feito);
  const padrao = mensagemPadrao(av, cli?.nome || p?.cliente_nome || "", p?.banco);
  const [texto, setTexto] = useState(av.mensagem || padrao); const [mexeu, setMexeu] = useState(!!av.mensagem);
  const [fone, setFone] = useState(cli?.telefone || "");
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
    await salvar(sim ? { status: "avisado", avisado_em: new Date().toISOString(), avisado_por: eu.id, canal: "WhatsApp", mensagem: texto } : { status: "pendente", avisado_em: null });
    registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: sim ? "cliente_avisado" : "aviso_reaberto", dados: { texto: (av.tipo_evento || "Ato") + (av.data_evento ? " em " + dataBR(av.data_evento) + (av.hora ? " às " + av.hora.slice(0, 5) : "") : "") } });
    aviso(sim ? "Registrado: cliente avisado." : "Aviso voltou para pendente.");
    if (sim) setMin(true);
  };
  const topo = (
    <div className="av-top">
      <button className="av-tit" onClick={() => setMin(!min)} aria-expanded={!min}><span className="seta">{min ? "▸" : "▾"}</span><strong>{feito ? "Cliente avisado" : "Avisar o cliente"}</strong></button>
      <span className="tools">{feito ? <span className="pill ok">{(av.canal || "WhatsApp") + " · " + nome(av.avisado_por) + " · " + dataHoraBR(av.avisado_em)}</span> : <span className="pill soon">pendente</span>}
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
        <label className="f">{av.modalidade === "jf_balcao" ? "Até o dia" : "Data"}<input type="date" defaultValue={av.data_evento || ""} onBlur={(e) => e.target.value !== (av.data_evento || "") && salvar({ data_evento: e.target.value || null })} /></label>
        <label className="f">Hora<input type="time" defaultValue={(av.hora || "").slice(0, 5)} onBlur={(e) => e.target.value !== (av.hora || "").slice(0, 5) && salvar({ hora: e.target.value || null })} /></label>
        {av.modalidade === "video" && <label className="f wide2">Link da sala virtual<input defaultValue={av.link || ""} placeholder="https://…" onBlur={(e) => e.target.value !== (av.link || "") && salvar({ link: e.target.value.trim() || null })} /></label>}
        {av.modalidade !== "video" && <label className="f wide2">Local<input defaultValue={av.local || ""} placeholder="Ex.: secretaria da 6ª Vara Federal de Joinville" onBlur={(e) => e.target.value !== (av.local || "") && salvar({ local: e.target.value || null })} /></label>}
        <label className="f wide">Orientações ao cliente<input defaultValue={av.orientacoes || ""} placeholder="Ex.: levar documento com foto; a coleta leva cerca de 1 hora" onBlur={(e) => e.target.value !== (av.orientacoes || "") && salvar({ orientacoes: e.target.value || null })} /></label>
      </div>
      <label className="f">Mensagem<textarea rows={6} value={texto} onChange={(e) => { setTexto(e.target.value); setMexeu(true); }} /></label>
      {mexeu && <div><button className="reflink" onClick={() => { setMexeu(false); setTexto(padrao); }}>Voltar à mensagem padrão</button></div>}
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
        {feito ? <button className="btn ghost" onClick={() => marcar(false)}>Desfazer</button> : <button className="btn primary" onClick={() => marcar(true)}>Marcar como avisado</button>}
      </div>
      {!feito && av.aberto_em && <div className="muted" style={{ fontSize: 12 }}>WhatsApp aberto em {dataHoraBR(av.aberto_em)}. Depois de enviar, marque como avisado.</div>}
    </div>
  );
}

export const nomeDoAviso = (av: Aviso, d: ReturnType<typeof useDados>) => nomeBonito(d.processos.get(av.processo_numero)?.cliente_nome || "—");
