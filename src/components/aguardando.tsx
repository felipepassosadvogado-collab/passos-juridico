"use client";
// Balão ao lado do chat interno: clientes que a assistente virtual passou para a equipe e ainda
// esperam resposta. Fica vermelho, pulsa, toca um aviso e se abre sozinho quando um cliente chega
// a 3 chamadas sem resposta. Some quando a equipe responde (pelo sistema ou pelo celular).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDados } from "@/lib/dados";
import { ALERTA_CHAMADAS, esperaDaConversa, haQuanto, type Espera, type MsgEspera } from "@/lib/aguardando";
import { useNomeConversa, useWaConversas } from "./whatsapp";

const REABRIR_MS = 15 * 60e3; // com alguém em alerta, o balão volta a se abrir a cada 15 min

function bip() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const a = new Ctx(); const t = a.currentTime;
    for (const [i, f] of [880, 660, 880].entries()) {
      const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = f; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.22); g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18);
      o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.2);
    }
    setTimeout(() => a.close(), 1200);
  } catch { /* navegador sem áudio */ }
}

export function AguardandoResposta() {
  const pathname = usePathname(); const { sb } = useDados(); const { lista } = useWaConversas(); const nomeDe = useNomeConversa();
  const pendentes = useMemo(() => lista.filter((c) => c.aguardando_equipe && !c.arquivada), [lista]);
  // muda quando entra/sai alguém ou chega mensagem nova numa conversa pendente (ultima_em)
  const chave = pendentes.map((c) => c.id + "@" + c.ultima_em).join("|");
  const [esperas, setEsperas] = useState<Record<string, Espera>>({});
  const [aberto, setAberto] = useState(false); const [agora, setAgora] = useState(Date.now());
  const alertados = useRef(new Set<string>()); const ultimaAbertura = useRef(0);

  useEffect(() => {
    if (!pendentes.length) { setEsperas({}); return; }
    let vivo = true;
    const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    sb.from("wa_mensagens").select("conversa_id,de_mim,em").in("conversa_id", pendentes.map((c) => c.id)).gte("em", desde).order("em", { ascending: false }).limit(3000)
      .then(({ data }: { data: (MsgEspera & { conversa_id: string })[] | null }) => {
        if (!vivo) return;
        const por = new Map<string, MsgEspera[]>(); for (const m of data || []) { const l = por.get(m.conversa_id) || []; l.push(m); por.set(m.conversa_id, l); }
        const r: Record<string, Espera> = {}; for (const c of pendentes) r[c.id] = esperaDaConversa(por.get(c.id) || []);
        setEsperas(r);
      });
    return () => { vivo = false; };
  }, [sb, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60e3); return () => clearInterval(t); }, []);

  const itens = pendentes.map((c) => ({ c, e: esperas[c.id] || { chamadas: 1, desde: c.ultima_em } }))
    .sort((a, b) => b.e.chamadas - a.e.chamadas || (a.e.desde || "").localeCompare(b.e.desde || ""));
  const emAlerta = itens.filter((x) => x.e.chamadas >= ALERTA_CHAMADAS);

  // alguém novo chegou ao alerta: toca e abre; com alerta persistente, reabre de tempos em tempos
  useEffect(() => {
    const ids = new Set(emAlerta.map((x) => x.c.id));
    for (const id of [...alertados.current]) if (!ids.has(id)) alertados.current.delete(id);
    const novos = [...ids].filter((id) => !alertados.current.has(id));
    novos.forEach((id) => alertados.current.add(id));
    const vencido = ids.size > 0 && agora - ultimaAbertura.current > REABRIR_MS;
    if (novos.length || vencido) { if (novos.length) bip(); setAberto(true); ultimaAbertura.current = Date.now(); }
  }, [emAlerta.map((x) => x.c.id).join("|"), agora]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!itens.length || pathname.startsWith("/whatsapp")) return null;
  const alerta = emAlerta.length > 0;
  const semChatAoLado = pathname.startsWith("/chat");
  const rotulo = `${itens.length} cliente${itens.length > 1 ? "s" : ""} esperando resposta da equipe` + (alerta ? `, ${emAlerta.length} com ${ALERTA_CHAMADAS} ou mais chamadas` : "");

  return (
    <div className={"ag-flut" + (semChatAoLado ? " so" : "")}>
      {aberto && <div className={"ag-janela" + (alerta ? " alerta" : "")} role="dialog" aria-label="Clientes esperando resposta">
        <header className="ag-topo">
          <span><strong>{alerta ? "⚠ Responda agora" : "Clientes esperando a equipe"}</strong>
            <span className="ag-sub">{alerta ? `${emAlerta.length} cliente${emAlerta.length > 1 ? "s" : ""} já ${emAlerta.length > 1 ? "chamaram" : "chamou"} ${ALERTA_CHAMADAS}+ vezes sem resposta` : "A assistente passou o atendimento para vocês"}</span></span>
          <button className="icb" title="Minimizar" aria-label="Minimizar" onClick={() => setAberto(false)}><span aria-hidden="true">–</span></button>
        </header>
        <div className="ag-lista">{itens.map(({ c, e }) => { const quente = e.chamadas >= ALERTA_CHAMADAS;
          return <Link key={c.id} href={"/whatsapp?c=" + encodeURIComponent(c.id)} className={"ag-item" + (quente ? " quente" : "")} onClick={() => setAberto(false)}>
            <span className="ag-n" title="Chamadas sem resposta">{e.chamadas}</span>
            <span className="ag-c"><span className="ag-nome">{nomeDe(c)}</span>
              <span className="ag-res">{(c.resumo || c.ultima_texto || "").slice(0, 110)}</span></span>
            <span className={"ag-tempo" + (quente ? " quente" : "")}>{haQuanto(e.desde, agora)}</span></Link>; })}</div>
        <div className="ag-pe">O número é quantas vezes o cliente chamou sem resposta. Ao responder pelo sistema ou pelo celular, ele sai daqui.</div>
      </div>}
      <button className={"ag-botao" + (alerta ? " alerta" : "")} title={rotulo} aria-label={rotulo} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5a4.5 4.5 0 0 0-4.5 4.5v2.6L4 13.5h12l-1.5-2.9V8A4.5 4.5 0 0 0 10 3.5zM8.3 16a1.8 1.8 0 0 0 3.4 0" /></svg>
        <span className="count">{itens.length}</span>
      </button>
    </div>
  );
}
