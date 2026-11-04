"use client";
// Ficha do atendimento: responder a pessoa pelo WhatsApp do escritório, escrevendo à mão ou pedindo ao Claude
// ("diga que ela não tem direito porque…"). A conversa vem pela ficha do cliente, pelo telefone anotado pela
// assistente virtual quando abriu o atendimento ou pelo telefone da ficha.
import { useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { chaveFone } from "@/lib/whatsapp";
import { foneDaObs, primeiroFone } from "@/lib/atendimentoWa";
import { nomeBonito } from "@/lib/formato";
import type { Caso } from "@/lib/tipos";
import { Ic, useConfirmar } from "./ui";
import { FioWa, enviarWhatsapp, foneBR, useWaConversas, useWaMensagens } from "./whatsapp";

/** pontos de partida para as instruções ao Claude; o advogado completa o que estiver entre colchetes */
const MODELOS: [string, string][] = [
  ["Não tem direito", "Dizer que analisamos o caso e que, pelo que foi contado, ela não tem direito a [o quê], porque [motivo]. Por isso o escritório não vai entrar com a ação. Agradecer a confiança."],
  ["Pedir documentos", "Pedir que envie por aqui, em foto legível: RG ou CNH, comprovante de residência e o extrato de empréstimos do INSS (HISCON), que dá para tirar no app Meu INSS."],
  ["Pedir mais informações", "Pedir mais informações para analisar o caso: [o que falta saber]."],
  ["Vamos entrar com a ação", "Dizer que analisamos o caso, que vamos entrar com a ação contra [banco] e explicar os próximos passos: [próximos passos]."],
  ["Marcar uma conversa", "Convidar para uma conversa (ligação ou no escritório) para explicar o caso com calma e pedir o melhor dia e horário."],
];

export function ResponderAtendimento({ caso, onFechar }: { caso: Caso; onFechar: () => void }) {
  const { clientes, config, aviso, registrar } = useDados(); const { lista } = useWaConversas(); const confirmar = useConfirmar();
  const cli = caso.cliente_id ? clientes.get(caso.cliente_id) : undefined;
  const daObs = foneDaObs(caso.obs); const daFicha = primeiroFone(cli?.telefone);
  const conv = useMemo(() => {
    if (caso.cliente_id) { const c = lista.find((x) => x.cliente_id === caso.cliente_id); if (c) return c; }
    for (const f of [daObs, daFicha]) { if (!f) continue; const c = lista.find((x) => x.telefone && chaveFone(x.telefone) === chaveFone(f)); if (c) return c; }
    return null;
  }, [lista, caso.cliente_id, daObs, daFicha]);
  const { msgs, carregando, juntar } = useWaMensagens(conv?.id || null);
  const [foneDigitado, setFoneDigitado] = useState("");
  const telefone = conv?.telefone || daObs || daFicha || (foneDigitado.replace(/\D/g, "").length >= 10 ? foneDigitado : "");
  const ligado = (config.whatsapp as { estado?: string } | undefined)?.estado === "open";
  const [instr, setInstr] = useState(""); const [texto, setTexto] = useState(""); const [alertas, setAlertas] = useState<string[]>([]);
  const [escrevendo, setEscrevendo] = useState(false); const [enviando, setEnviando] = useState(false);
  const refInstr = useRef<HTMLTextAreaElement>(null);
  const nome = nomeBonito(cli?.nome || caso.nome || "");

  const usarModelo = (t: string) => {
    setInstr(t);
    setTimeout(() => { const el = refInstr.current; if (!el) return; el.focus(); const i = t.indexOf("["); if (i >= 0) el.setSelectionRange(i, t.indexOf("]", i) + 1); }, 0);
  };
  const escrever = async () => {
    if (!instr.trim()) { aviso("Diga ao Claude o que a mensagem deve dizer."); refInstr.current?.focus(); return; }
    if (/\[[^\]]+\]/.test(instr)) { aviso("Complete o que está entre [colchetes] nas instruções."); return; }
    setEscrevendo(true); setAlertas([]);
    try {
      const r = await fetch("/api/claude/resposta-atendimento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ casoId: caso.id, instrucoes: instr.trim(), mensagemAtual: texto }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(j.erro || "Não consegui escrever a mensagem agora."); return; }
      setTexto(j.mensagem); setAlertas(j.alertas || []); aviso("Mensagem escrita pelo Claude. Confira antes de enviar.");
    } finally { setEscrevendo(false); }
  };
  const enviar = async () => {
    const t = texto.trim(); if (!t || enviando) return;
    if (!ligado) { aviso("O WhatsApp do sistema está desconectado. Conecte em Configurações."); return; }
    if (!conv && !telefone) { aviso("Informe o telefone da pessoa."); return; }
    if (!confirmar("wa" + caso.id, aviso, `Clique de novo em “Enviar” para mandar a mensagem para ${nome || "a pessoa"} (${foneBR(telefone)}).`)) return;
    setEnviando(true);
    try {
      const r = await enviarWhatsapp(conv ? { conversaId: conv.id, texto: t } : { telefone, nome, texto: t, ...(caso.cliente_id ? { clienteId: caso.cliente_id } : { avulso: true }) });
      if (conv) juntar(r.mensagem);
      registrar({ caso_id: caso.id, tipo: "comentario", dados: { texto: "Mensagem enviada pelo WhatsApp: " + t.slice(0, 1500) } });
      setTexto(""); setAlertas([]); aviso("Mensagem enviada pelo WhatsApp.");
    } catch (e) { aviso(msgErro(e, (e as Error).message)); }
    finally { setEnviando(false); }
  };

  return (
    <section className="panel resp-at">
      <div className="ph"><h3>Responder {nome ? nome.split(" ")[0] : "o cliente"}</h3>
        <div className="tools">{conv && <a className="reflink" href={"/whatsapp?c=" + conv.id} title="Abrir esta conversa no painel de WhatsApp do escritório">abrir no WhatsApp <span aria-hidden="true">↗</span></a>}
          <button className="btn ghost" onClick={onFechar}>Fechar</button></div></div>
      <div className="resp-at-corpo">
        <div className="muted s">Para: <b>{nome || "—"}</b>{telefone ? " · " + foneBR(telefone) : ""}{!ligado && <span className="late"> · WhatsApp do sistema desconectado</span>}</div>
        {!conv && !daObs && !daFicha && <label className="f">Telefone (WhatsApp)<input inputMode="tel" placeholder="(47) 99999-9999" value={foneDigitado} onChange={(e) => setFoneDigitado(e.target.value)} /></label>}
        {conv && <div className="wa-cli wa-cli-corpo"><FioWa msgs={msgs.slice(-6)} carregando={carregando} /></div>}

        <div className="resp-at-claude">
          <div className="resp-at-h">{Ic.claude}<b>Pedir ao Claude</b><span className="muted s">diga o que você decidiu; ele escreve a mensagem lendo o atendimento e a conversa</span></div>
          <div className="wa-chips">{MODELOS.map(([r, t]) => <button key={r} type="button" className="pill" onClick={() => usarModelo(t)}>{r}</button>)}</div>
          <textarea ref={refInstr} rows={3} value={instr} placeholder="Ex.: dizer que ela não tem direito ao auxílio-acidente porque não era segurada do INSS na época do acidente" onChange={(e) => setInstr(e.target.value)} />
          <div className="tools"><button className="btn" disabled={escrevendo || !instr.trim()} onClick={escrever}>{escrevendo ? "Escrevendo…" : texto.trim() ? "Reescrever com o Claude" : "Escrever com o Claude"}</button></div>
        </div>

        <label className="f">Mensagem<textarea rows={7} value={texto} placeholder="Escreva aqui ou peça ao Claude acima" onChange={(e) => setTexto(e.target.value)} /></label>
        {alertas.length > 0 && <div className="banner"><b>Confira antes de enviar:</b><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{alertas.map((a) => <li key={a}>{a}</li>)}</ul></div>}
        <div className="tools">
          <button className="btn primary" disabled={enviando || !texto.trim() || !ligado || (!conv && !telefone)} onClick={enviar}>{enviando ? "Enviando…" : "Enviar pelo WhatsApp"}</button>
          <button className="btn ghost" disabled={!texto.trim()} onClick={() => { navigator.clipboard?.writeText(texto).then(() => aviso("Mensagem copiada."), () => aviso("Não consegui copiar.")); }}>Copiar</button>
        </div>
      </div>
    </section>
  );
}
