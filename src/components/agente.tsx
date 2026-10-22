"use client";
// Assistente virtual do WhatsApp: configuração, situação da conversa (assistente x equipe) e rascunhos para aprovar.
import { useEffect, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataHoraBR } from "@/lib/formato";
import { enviarWhatsapp, type WaConversa, type WaMensagem } from "./whatsapp";

const GOLPE = "Atenção ao golpe do falso advogado: este é o único WhatsApp oficial do escritório, (47) 99642-4673. Nós nunca pedimos pagamento, PIX ou depósito para liberar valores de processo. Se alguém entrar em contato em nome do escritório pedindo dinheiro, não pague e fale com a gente por aqui.";
type Cfg = { modo?: "desligado" | "rascunho" | "automatico"; nome?: string; horario?: string; avisoGolpe?: string; instrucoes?: string };
const MODOS: [NonNullable<Cfg["modo"]>, string, string][] = [
  ["desligado", "Desligado", "Ninguém responde sozinho."],
  ["rascunho", "Sugere a resposta", "O assistente escreve, a equipe confere e envia. Bom para começar."],
  ["automatico", "Responde sozinho", "O assistente responde na hora, a qualquer hora do dia."],
];

export function useAgente() { const { config } = useDados(); return (config.agente || {}) as Cfg; }

/** seção em Configurações */
export function ConfigAgente() {
  const { sb, aviso } = useDados(); const cfg = useAgente();
  const [f, setF] = useState<Cfg>({}); useEffect(() => setF({ nome: "Ana", horario: "segunda a sexta, das 9h às 18h", avisoGolpe: GOLPE, ...cfg }), [JSON.stringify(cfg)]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async (v: Cfg, ok: string) => {
    const { error } = await sb.from("config").upsert({ chave: "agente", valor: { ...cfg, ...v } }, { onConflict: "chave" });
    if (error) aviso(msgErro(error)); else aviso(ok);
  };
  const modo = cfg.modo || "desligado";
  return (
    <section className="panel"><div className="ph"><h3>Assistente virtual do WhatsApp</h3><span className="muted" style={{ fontSize: 12.5 }}>responde os clientes com o Claude</span></div>
      <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "76ch" }}>
        <p style={{ margin: 0 }}>Cumprimenta com o aviso do golpe do falso advogado, pede o CPF, confere a identidade (telefone da ficha ou data de nascimento), lê todos os andamentos e explica o processo em linguagem simples. Entende casos novos e registra no CRM com um resumo. Quando o cliente pede uma pessoa, ou o assunto é valor, honorários ou estratégia, passa para a equipe e avisa no sino.</p>
        <div className="seg" role="tablist" style={{ alignSelf: "flex-start" }}>{MODOS.map(([k, t]) =>
          <button key={k} role="tab" aria-selected={modo === k} onClick={() => salvar({ modo: k }, k === "desligado" ? "Assistente desligado." : k === "rascunho" ? "O assistente vai sugerir as respostas." : "O assistente vai responder sozinho.")}>{t}</button>)}</div>
        <div className="muted" style={{ fontSize: 13 }}>{MODOS.find((m) => m[0] === modo)![2]} Quando alguém da equipe responde (aqui ou no celular), o assistente fica quieto naquela conversa por 12 horas.</div>
        {modo !== "desligado" && <div className="banner">Desligue o robô do Atende Direito neste número, senão os dois respondem ao mesmo tempo (e as mensagens dele pausam o assistente).</div>}
        <div className="triage">
          <label className="f">Nome do assistente<input value={f.nome || ""} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
          <label className="f wide2">Horário da equipe<input value={f.horario || ""} onChange={(e) => setF({ ...f, horario: e.target.value })} /></label>
        </div>
        <label className="f">Aviso do golpe (na primeira mensagem; o assistente escreve com as palavras dele)<textarea rows={3} value={f.avisoGolpe || ""} onChange={(e) => setF({ ...f, avisoGolpe: e.target.value })} /></label>
        <label className="f">Orientações extras (opcional)<textarea rows={3} value={f.instrucoes || ""} placeholder="Ex.: perícias do JEF de Joinville são no 2º andar; para mandar documentos, pedir foto nítida de frente e verso." onChange={(e) => setF({ ...f, instrucoes: e.target.value })} /></label>
        <div className="tools"><button className="btn primary" onClick={() => salvar({ nome: f.nome?.trim(), horario: f.horario?.trim(), avisoGolpe: f.avisoGolpe?.trim(), instrucoes: f.instrucoes?.trim() }, "Assistente salvo.")}>Salvar</button></div>
        <div className="muted" style={{ fontSize: 12.5 }}>Ele sempre se apresenta como assistente virtual do escritório: não finge ser pessoa nem advogado, não promete resultado, não fala de valores a receber nem de honorários.</div>
      </div></section>
  );
}

/** faixa no topo da conversa: quem está atendendo, pedido de atendente e rascunho do assistente */
export function AgenteNaConversa({ conv, onAtualizar, onEnviada }: { conv: WaConversa; onAtualizar: (c: WaConversa) => void; onEnviada: (m: WaMensagem) => void }) {
  const { sb, aviso } = useDados(); const cfg = useAgente(); const modo = cfg.modo || "desligado";
  const [editando, setEditando] = useState<string | null>(null); const [enviando, setEnviando] = useState(false);
  useEffect(() => setEditando(null), [conv.id, conv.rascunho_em]);
  const mudar = async (v: Partial<WaConversa>, ok?: string) => {
    const { data, error } = await sb.from("wa_conversas").update(v).eq("id", conv.id).select().single();
    if (error) aviso(msgErro(error)); else { onAtualizar(data); if (ok) aviso(ok); }
  };
  if (modo === "desligado" || conv.atendimento === undefined) return null;
  const pausado = conv.atendimento === "equipe" && (!conv.equipe_ate || new Date(conv.equipe_ate) > new Date());
  const assumir = () => mudar({ atendimento: "equipe", equipe_ate: new Date(Date.now() + 12 * 3600e3).toISOString(), aguardando_equipe: false, rascunho: null }, "Você assumiu: o assistente fica quieto nesta conversa por 12 horas.");
  const devolver = () => mudar({ atendimento: "agente", equipe_ate: null, aguardando_equipe: false }, "O assistente volta a atender esta conversa.");
  const enviarRascunho = async () => {
    const partes = (editando ?? conv.rascunho ?? "").split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean); if (!partes.length) return;
    setEnviando(true);
    try { for (const p of partes) { const r = await enviarWhatsapp({ conversaId: conv.id, texto: p, origem: "rascunho" }); onEnviada(r.mensagem); } await mudar({ rascunho: null }); }
    catch (e) { aviso(msgErro(e, (e as Error).message)); } finally { setEnviando(false); }
  };
  return (
    <div className="wa-agente">
      <div className="wa-ag-linha">
        {pausado ? <span className="chip">👤 Equipe atendendo{conv.equipe_ate ? " · assistente volta " + dataHoraBR(conv.equipe_ate).slice(0, 16) : ""}</span>
          : conv.aguardando_equipe ? <span className="chip hot">🙋 Pediu atendimento da equipe</span>
          : <span className="chip acc">🤖 Assistente virtual {modo === "rascunho" ? "sugerindo respostas" : "atendendo"}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {!pausado && <button className="btn ghost" onClick={assumir}>Assumir a conversa</button>}
          {(pausado || conv.aguardando_equipe) && <button className="btn ghost" onClick={devolver}>Devolver ao assistente</button>}
        </span>
      </div>
      {conv.aguardando_equipe && conv.resumo && <div className="wa-ag-resumo"><b>Resumo do assistente:</b> {conv.resumo}</div>}
      {conv.rascunho && !pausado && <div className="wa-ag-rasc">
        <div className="muted s">Resposta sugerida pelo assistente{conv.rascunho_em ? " · " + dataHoraBR(conv.rascunho_em).slice(11, 16) : ""} — confira antes de enviar. Linhas com --- separam as mensagens.</div>
        {editando !== null ? <textarea rows={6} value={editando} onChange={(e) => setEditando(e.target.value)} />
          : <div className="wa-ag-partes">{conv.rascunho.split(/\n\s*-{3,}\s*\n/).map((p, i) => <div key={i} className="bolha">{p}</div>)}</div>}
        <div className="tools">
          <button className="btn primary" disabled={enviando} onClick={enviarRascunho}>{enviando ? "Enviando…" : "Enviar"}</button>
          {editando === null && <button className="btn" onClick={() => setEditando(conv.rascunho || "")}>Editar</button>}
          <button className="btn ghost" onClick={() => mudar({ rascunho: null })}>Descartar</button>
        </div>
      </div>}
    </div>
  );
}
