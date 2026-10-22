"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataHoraBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { useJanelas } from "@/components/janelas";
import { BuscaCliente, CompositorWa, FioWa, PainelConexao, foneBR, useConexaoWa, useNomeConversa, useWaConversas, useWaMensagens, type WaConversa } from "@/components/whatsapp";

type Filtro = "todas" | "naolidas" | "clientes" | "sem";

function WhatsApp() {
  const sp = useSearchParams(); const { sb, clientes, processos, aviso } = useDados(); const j = useJanelas();
  const { lista, semTabela, atualizar } = useWaConversas(); const nomeDe = useNomeConversa(); const { conectado } = useConexaoWa();
  const [ativa, setAtiva] = useState<string | null>(sp.get("c")); const [aberto, setAberto] = useState(!!sp.get("c"));
  const [q, setQ] = useState(""); const [filtro, setFiltro] = useState<Filtro>("todas");
  const [nova, setNova] = useState<{ clienteId: string } | null>(null); const [ligando, setLigando] = useState(false); const [buscaNova, setBuscaNova] = useState(false);
  const conv = ativa ? lista.find((c) => c.id === ativa) || null : null;
  const { msgs, carregando, juntar } = useWaMensagens(conv?.id || null);
  // abriu a conversa: zera as não lidas
  useEffect(() => {
    if (!conv || !conv.nao_lidas) return;
    sb.from("wa_conversas").update({ nao_lidas: 0 }).eq("id", conv.id).select().single().then(({ data }: { data: WaConversa | null }) => { if (data) atualizar(data); });
  }, [conv?.id, conv?.nao_lidas]); // eslint-disable-line react-hooks/exhaustive-deps
  const vis = useMemo(() => {
    const n = semAcento(q.trim()); const d = q.replace(/\D/g, "");
    return lista.filter((c) => !c.arquivada || filtro !== "todas").filter((c) =>
      (filtro === "naolidas" ? c.nao_lidas > 0 : filtro === "clientes" ? !!c.cliente_id : filtro === "sem" ? !c.cliente_id : true)
      && (!n || semAcento(nomeDe(c)).includes(n) || semAcento(c.nome || "").includes(n) || (d.length >= 4 && (c.telefone || "").includes(d))));
  }, [lista, q, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const cli = conv?.cliente_id ? clientes.get(conv.cliente_id) : nova ? clientes.get(nova.clienteId) : undefined;
  const procs = cli ? [...processos.values()].filter((p) => p.cliente_id === cli.id) : [];
  const ligar = async (clienteId: string | null) => {
    if (!conv) return; setLigando(false);
    const { data, error } = await sb.from("wa_conversas").update({ cliente_id: clienteId }).eq("id", conv.id).select().single();
    if (error) aviso(msgErro(error)); else { atualizar(data); aviso(clienteId ? "Conversa ligada ao cliente." : "Conversa desligada do cliente."); }
  };
  const arquivar = async () => { if (!conv) return; const { data } = await sb.from("wa_conversas").update({ arquivada: !conv.arquivada }).eq("id", conv.id).select().single(); if (data) { atualizar(data); if (data.arquivada) { setAtiva(null); setAberto(false); } } };
  const hoje = hojeBR();
  if (semTabela) return <><div className="pg-title"><h2>WhatsApp</h2></div><div className="banner erro">Falta instalar a etapa 0020 (0020_whatsapp.sql) no Supabase.</div></>;
  const titulo = conv ? nomeDe(conv) : cli ? nomeBonito(cli.nome) : "";
  return (
    <>
      <div className="pg-title"><h2>WhatsApp</h2><span className="muted">Mensagens do WhatsApp do escritório</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => { setBuscaNova(!buscaNova); }}>{buscaNova ? "Cancelar" : "+ Nova conversa"}</button></div>
      <PainelConexao compacto />
      {buscaNova && <div className="panel" style={{ padding: 12, marginBottom: 10 }}><BuscaCliente soComTelefone placeholder="Nova conversa com um cliente: digite o nome ou o CPF" onEscolher={(id) => {
        const c = clientes.get(id); const ja = lista.find((x) => x.cliente_id === id);
        setBuscaNova(false);
        if (ja) { setAtiva(ja.id); setNova(null); } else if (c?.telefone) { setAtiva(null); setNova({ clienteId: id }); } setAberto(true);
      }} /></div>}
      <div className={"chat wa" + (aberto ? " aberto" : "")}>
        <aside className="chat-lista">
          <div className="wa-filtros">
            <input value={q} placeholder="Buscar nome ou telefone" onChange={(e) => setQ(e.target.value)} />
            <div className="wa-chips">{([["todas", "Todas"], ["naolidas", "Não lidas"], ["clientes", "Clientes"], ["sem", "Sem cliente"]] as [Filtro, string][]).map(([k, t]) =>
              <button key={k} className={"pill" + (filtro === k ? " acc" : "")} onClick={() => setFiltro(k)}>{t}</button>)}</div>
          </div>
          {vis.map((c) => { const d = new Date(c.ultima_em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
            return <button key={c.id} className={"chat-conv" + (c.id === ativa ? " ativa" : "")} onClick={() => { setAtiva(c.id); setNova(null); setAberto(true); }}>
              <span className={"avr wa-av" + (c.cliente_id ? " cli" : "")}>{iniciais(nomeDe(c)) || "?"}</span>
              <span className="cc"><span className="cn">{nomeDe(c)}</span><span className="cs">{c.ultima_texto || foneBR(c.telefone)}</span></span>
              <span className="wa-dir"><span className="muted s">{d === hoje ? dataHoraBR(c.ultima_em).slice(11) : dataHoraBR(c.ultima_em).slice(0, 5)}</span>{c.nao_lidas ? <span className="count hot">{c.nao_lidas}</span> : null}</span></button>; })}
          {!vis.length && <div className="muted chat-dica">{lista.length ? "Nenhuma conversa com esse filtro." : conectado ? "Nenhuma mensagem ainda. As novas aparecem aqui assim que chegarem." : "Conecte o WhatsApp para as conversas aparecerem aqui."}</div>}
        </aside>
        <section className="chat-thread">
          {conv || nova ? <>
            <header className="chat-topo wa-topo"><button className="btn ghost voltar" onClick={() => setAberto(false)}>‹</button>
              <span className={"avr wa-av" + (cli ? " cli" : "")}>{iniciais(titulo) || "?"}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{titulo}</div>
                <div className="muted s">{foneBR(conv?.telefone || cli?.telefone)}{conv?.nome && cli && semAcento(conv.nome) !== semAcento(cli.nome) ? ` · no WhatsApp: ${conv.nome}` : ""}</div></div>
              <div className="wa-acoes">
                {cli ? <>
                  <button className="btn ghost" onClick={() => j.abrirCliente(cli.id)}>Ficha do cliente</button>
                  {procs.slice(0, 3).map((p) => <button key={p.numero} className="pill" title={p.mascara} onClick={() => j.abrirProcesso(p.numero)}>{bancoCurto(p.banco)} · {p.mascara.slice(0, 7)}</button>)}
                  {conv && <button className="btn ghost" title="Desligar desta ficha" onClick={() => ligar(null)}>✕</button>}
                </> : conv && (ligando ? <BuscaCliente placeholder="Ligar a um cliente: nome ou CPF" onEscolher={(id) => ligar(id)} /> : <button className="btn" onClick={() => setLigando(true)}>Ligar a um cliente</button>)}
                {conv && <button className="btn ghost" onClick={arquivar}>{conv.arquivada ? "Desarquivar" : "Arquivar"}</button>}
              </div>
            </header>
            {conv ? <FioWa msgs={msgs} carregando={carregando} /> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Nova conversa com {titulo}. Escreva abaixo.</div></div>}
            <CompositorWa conversaId={conv?.id || null} telefone={cli?.telefone} desativado={!conectado ? "WhatsApp desconectado: conecte em Configurações para enviar." : undefined}
              onEnviada={(m, id) => { if (!conv) { setNova(null); setAtiva(id); } else juntar(m); }} />
          </> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Escolha uma conversa.</div></div>}
        </section>
      </div>
    </>
  );
}
export default function Pagina() { return <Suspense><WhatsApp /></Suspense>; }
