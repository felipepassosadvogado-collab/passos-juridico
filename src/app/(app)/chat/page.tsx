"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDados } from "@/lib/dados";
import { iniciais } from "@/lib/formato";
import { Compositor, Fio, Presenca, outroDaDm, useChat, useResumoMsg } from "@/components/chat";
import { Avatar } from "@/components/ui";

function Chat() {
  const sp = useSearchParams(); const { eu } = useDados(); const { convs, naoLidas, daConversa } = useChat(); const resumo = useResumoMsg();
  const [ativa, setAtiva] = useState(sp.get("c") || ""); const [aberto, setAberto] = useState(!!sp.get("c"));
  const atual = convs.find((c) => c.id === ativa) || convs[0];
  const { online } = useDados();
  if (!atual) return <><div className="pg-title"><h2>Chat</h2></div><div className="panel"><div className="empty">Para conversar, convide alguém em Equipe.</div></div></>;
  return (
    <>
      <div className="pg-title"><h2>Chat</h2><span className="muted">Conversas internas do escritório</span></div>
      <div className={"chat" + (aberto ? " aberto" : "")}>
        <aside className="chat-lista">{convs.map((c) => { const n = naoLidas(c.id); const ult = daConversa(c.id).slice(-1)[0];
          return <button key={c.id} className={"chat-conv" + (c.id === atual.id ? " ativa" : "")} onClick={() => { setAtiva(c.id); setAberto(true); }}>
            <span className="av-pres"><Avatar id={outroDaDm(c.id, eu.id)} nome={c.nome} />{online.has(outroDaDm(c.id, eu.id) || "") && <span className="ponto-on" title="No sistema agora" />}</span>
            <span className="cc"><span className="cn">{c.nome}</span><span className="cs">{ult ? (ult.de === eu.id ? "Você: " : "") + resumo(ult).slice(0, 60) : c.sub}</span></span>{n ? <span className="count hot">{n}</span> : null}</button>; })}
          <div className="muted chat-dica">Para conversar com alguém, convide a pessoa em Equipe.</div></aside>
        <section className="chat-thread">
          <header className="chat-topo"><button className="btn ghost voltar" onClick={() => setAberto(false)}>‹</button><Avatar id={outroDaDm(atual.id, eu.id)} nome={atual.nome} />
            <div><div style={{ fontWeight: 700 }}>{atual.nome}</div><div style={{ fontSize: 12 }}><Presenca id={outroDaDm(atual.id, eu.id)} /></div></div>
            <div className="muted s" style={{ marginLeft: "auto" }} title="✓ enviada (a pessoa está fora do sistema) · ✓✓ entregue (a pessoa está no sistema) · ✓✓ azul: lida">✓ fora do sistema · ✓✓ no sistema · <span style={{ color: "#4d9bff" }}>✓✓ lida</span></div></header>
          <Fio key={atual.id} conversa={atual.id} vazio="Nenhuma mensagem ainda. Comece a conversa." />
          <Compositor key={"c" + atual.id} conversa={atual.id} placeholder={`Mensagem para ${atual.nome}…  (@ cita um processo · Enter envia)`} />
        </section>
      </div>
    </>
  );
}
export default function Pagina() { return <Suspense><Chat /></Suspense>; }
