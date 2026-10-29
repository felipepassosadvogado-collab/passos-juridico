"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataHoraBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { useJanelas } from "@/components/janelas";
import { AgenteNaConversa } from "@/components/agente";
import { BuscaCliente, CompositorWa, FioWa, PainelConexao, foneBR, useConexaoWa, useNomeConversa, useWaConversas, useWaMensagens, type WaConversa } from "@/components/whatsapp";

type Filtro = "todas" | "naolidas" | "equipe" | "clientes" | "sem";

function WhatsApp() {
  const sp = useSearchParams(); const { sb, clientes, processos, aviso, aplicar } = useDados(); const j = useJanelas();
  const { lista, semTabela, atualizar, carregado: loaded } = useWaConversas(); const nomeDe = useNomeConversa(); const { conectado } = useConexaoWa();
  const [ativa, setAtiva] = useState<string | null>(sp.get("c")); const [aberto, setAberto] = useState(!!sp.get("c"));
  const [q, setQ] = useState(""); const [filtro, setFiltro] = useState<Filtro>("todas");
  const [nova, setNova] = useState<{ clienteId?: string; telefone?: string; nome?: string; outroNumero?: boolean } | null>(null); const [modoNova, setModoNova] = useState<"cliente" | "avulso">("cliente"); const [av, setAv] = useState({ fone: "", nome: "", cadastrar: true, clienteId: "" }); const [criando, setCriando] = useState(false); const [ligando, setLigando] = useState(false); const [buscaNova, setBuscaNova] = useState(false);
  // veio de um link do cliente (?cliente=ID): abre a conversa que já existe ou começa uma nova com ele
  const pedidoCli = sp.get("cliente"); const [feito, setFeito] = useState("");
  useEffect(() => {
    if (!pedidoCli || feito === pedidoCli || !clientes.size) return;
    const c = clientes.get(pedidoCli); if (!c) return;
    const ja = lista.filter((x) => x.cliente_id === pedidoCli).sort((a, b) => b.ultima_em.localeCompare(a.ultima_em))[0];
    if (!ja && !loaded) return; // espera a lista de conversas carregar
    setFeito(pedidoCli); setBuscaNova(false); setAberto(true);
    if (ja) { setAtiva(ja.id); setNova(null); } else if (c.telefone) { setAtiva(null); setNova({ clienteId: pedidoCli }); } else aviso("Este cliente não tem telefone na ficha.");
  }, [pedidoCli, clientes.size, lista.length, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
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
      (filtro === "naolidas" ? c.nao_lidas > 0 : filtro === "equipe" ? !!c.aguardando_equipe : filtro === "clientes" ? !!c.cliente_id : filtro === "sem" ? !c.cliente_id : true)
      && (!n || semAcento(nomeDe(c)).includes(n) || semAcento(c.nome || "").includes(n) || (d.length >= 4 && (c.telefone || "").includes(d))));
  }, [lista, q, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const cli = conv?.cliente_id ? clientes.get(conv.cliente_id) : nova?.clienteId ? clientes.get(nova.clienteId) : undefined;
  const procs = cli ? [...processos.values()].filter((p) => p.cliente_id === cli.id) : [];
  const ligar = async (clienteId: string | null) => {
    if (!conv) return; setLigando(false);
    const { data, error } = await sb.from("wa_conversas").update({ cliente_id: clienteId }).eq("id", conv.id).select().single();
    if (error) aviso(msgErro(error)); else { atualizar(data); aviso(clienteId ? "Conversa ligada ao cliente." : "Conversa desligada do cliente."); }
  };
  const arquivar = async () => { if (!conv) return; const { data } = await sb.from("wa_conversas").update({ arquivada: !conv.arquivada }).eq("id", conv.id).select().single(); if (data) { atualizar(data); if (data.arquivada) { setAtiva(null); setAberto(false); } } };
  const hoje = hojeBR();
  if (semTabela) return <><div className="pg-title"><h2>WhatsApp</h2></div><div className="banner erro">Falta instalar a etapa 0020 (0020_whatsapp.sql) no Supabase.</div></>;
  const titulo = conv ? nomeDe(conv) : cli ? nomeBonito(cli.nome) : nova?.nome || foneBR(nova?.telefone) || "";
  return (
    <>
      <div className="pg-title"><h2>WhatsApp</h2><span className="muted">Mensagens do WhatsApp do escritório</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => { setBuscaNova(!buscaNova); }}>{buscaNova ? "Cancelar" : "+ Nova conversa"}</button></div>
      <PainelConexao compacto />
      {buscaNova && <div className="panel" style={{ padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="seg" role="tablist" style={{ alignSelf: "flex-start" }}>
          <button role="tab" aria-selected={modoNova === "cliente"} onClick={() => setModoNova("cliente")}>Cliente cadastrado</button>
          <button role="tab" aria-selected={modoNova === "avulso"} onClick={() => setModoNova("avulso")}>Número avulso (novo contato)</button>
        </div>
        {modoNova === "cliente" ? <BuscaCliente soComTelefone placeholder="Nova conversa com um cliente: digite o nome ou o CPF" onEscolher={(id) => {
          const c = clientes.get(id); const ja = lista.find((x) => x.cliente_id === id);
          setBuscaNova(false);
          if (ja) { setAtiva(ja.id); setNova(null); } else if (c?.telefone) { setAtiva(null); setNova({ clienteId: id }); } setAberto(true);
        }} /> : <div className="triage">
          <label className="f">WhatsApp (com DDD)<input inputMode="tel" autoFocus value={av.fone} placeholder="(47) 9 9999-9999" onChange={(e) => setAv({ ...av, fone: e.target.value })} /></label>
          <label className="f wide2">Nome<input value={av.nome} placeholder="Nome da pessoa" onChange={(e) => setAv({ ...av, nome: e.target.value })} /></label>
          <label className="f">Este número é de<select value={av.clienteId ? "existente" : av.cadastrar ? "novo" : "nenhum"} onChange={(e) => setAv({ ...av, cadastrar: e.target.value === "novo", clienteId: e.target.value === "existente" ? av.clienteId || "?" : "" })}>
            <option value="novo">Um cliente novo (cadastrar)</option><option value="existente">Um cliente que já existe (outro número dele)</option><option value="nenhum">Ninguém (só conversar)</option></select></label>
          {av.clienteId && <div className="f wide2">Cliente{av.clienteId !== "?" && clientes.get(av.clienteId) ? <span className="chip" style={{ alignSelf: "flex-start" }}>{nomeBonito(clientes.get(av.clienteId)!.nome)} <button className="reflink" onClick={() => setAv({ ...av, clienteId: "?" })}>trocar</button></span>
            : <BuscaCliente placeholder="Nome ou CPF do cliente" onEscolher={(id) => setAv({ ...av, clienteId: id })} />}</div>}
          <div className="tools" style={{ alignSelf: "flex-end" }}><button className="btn primary" disabled={criando} onClick={async () => {
            const d = av.fone.replace(/\D/g, ""); if (d.length < 10 || d.length > 13) { aviso("Informe o WhatsApp com DDD."); return; }
            if (av.cadastrar && !av.nome.trim()) { aviso("Informe o nome para cadastrar o cliente."); return; }
            if (av.clienteId === "?") { aviso("Escolha o cliente a quem este número pertence."); return; }
            const fone = d.length <= 11 ? d : d.replace(/^55/, "");
            const tel = fone.length === 11 ? `(${fone.slice(0, 2)}) ${fone.slice(2, 7)}-${fone.slice(7)}` : `(${fone.slice(0, 2)}) ${fone.slice(2, 6)}-${fone.slice(6)}`;
            const ja = lista.find((x) => (x.telefone || "").endsWith(fone.slice(-8)) && (x.telefone || "").includes(fone.slice(0, 2)));
            if (ja) { setAtiva(ja.id); setNova(null); setBuscaNova(false); setAberto(true); aviso("Já existe uma conversa com esse número."); return; }
            setCriando(true);
            try {
              let clienteId: string | undefined = av.clienteId || undefined;
              if (av.cadastrar && !clienteId) {
                const { data, error } = await sb.from("clientes").insert({ nome: av.nome.trim().toUpperCase(), telefone: tel }).select().single();
                if (error) { aviso(msgErro(error)); return; }
                aplicar("clientes", data); clienteId = data.id; aviso("Cliente cadastrado. Complete a ficha depois.");
              }
              setAtiva(null); setNova({ clienteId, telefone: tel, nome: av.nome.trim() || undefined, outroNumero: !!av.clienteId }); setBuscaNova(false); setAberto(true); setAv({ fone: "", nome: "", cadastrar: true, clienteId: "" });
            } finally { setCriando(false); }
          }}>{criando ? "Abrindo…" : "Abrir conversa"}</button></div>
        </div>}
      </div>}
      <div className={"chat wa" + (aberto ? " aberto" : "")}>
        <aside className="chat-lista">
          <div className="wa-filtros">
            <input value={q} aria-label="Buscar conversa por nome ou telefone" placeholder="Buscar nome ou telefone" onChange={(e) => setQ(e.target.value)} />
            <div className="wa-chips">{([["todas", "Todas"], ["naolidas", "Não lidas"], ["equipe", "Pediu atendente"], ["clientes", "Clientes"], ["sem", "Sem cliente"]] as [Filtro, string][]).map(([k, t]) =>
              <button key={k} className={"pill" + (filtro === k ? " acc" : "")} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t}</button>)}</div>
          </div>
          {vis.map((c) => { const d = new Date(c.ultima_em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
            return <button key={c.id} className={"chat-conv" + (c.id === ativa ? " ativa" : "")} onClick={() => { setAtiva(c.id); setNova(null); setAberto(true); }}>
              <span className={"avr wa-av" + (c.cliente_id ? " cli" : "")}>{iniciais(nomeDe(c)) || "?"}</span>
              <span className="cc"><span className="cn">{nomeDe(c)}</span><span className="cs">{c.ultima_texto || foneBR(c.telefone)}</span></span>
              <span className="wa-dir"><span className="muted s">{d === hoje ? dataHoraBR(c.ultima_em).slice(11) : dataHoraBR(c.ultima_em).slice(0, 5)}</span>{c.aguardando_equipe ? <span title="Pediu atendimento da equipe">🙋</span> : null}{c.nao_lidas ? <span className="count hot">{c.nao_lidas}</span> : null}</span></button>; })}
          {!vis.length && <div className="muted chat-dica">{lista.length ? "Nenhuma conversa com esse filtro." : conectado ? "Nenhuma mensagem ainda. As novas aparecem aqui assim que chegarem." : "Conecte o WhatsApp para as conversas aparecerem aqui."}</div>}
        </aside>
        <section className="chat-thread">
          {conv || nova ? <>
            <header className="chat-topo wa-topo"><button className="btn ghost voltar" title="Voltar à lista de conversas" aria-label="Voltar à lista de conversas" onClick={() => setAberto(false)}><span aria-hidden="true">‹</span></button>
              <span className={"avr wa-av" + (cli ? " cli" : "")}>{iniciais(titulo) || "?"}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700 }}>{titulo}</div>
                <div className="muted s">{foneBR(conv?.telefone || cli?.telefone || nova?.telefone)}{conv?.nome && cli && semAcento(conv.nome) !== semAcento(cli.nome) ? ` · no WhatsApp: ${conv.nome}` : ""}</div></div>
              <div className="wa-acoes">
                {cli ? <>
                  <button className="btn ghost" onClick={() => j.abrirCliente(cli.id)}>Ficha do cliente</button>
                  {procs.slice(0, 3).map((p) => <button key={p.numero} className="pill" title={"Abrir o processo " + p.mascara} aria-label={"Abrir o processo " + p.mascara + " contra " + bancoCurto(p.banco)} onClick={() => j.abrirProcesso(p.numero)}>{bancoCurto(p.banco)} · {p.mascara.slice(0, 7)}</button>)}
                  {conv && <button className="btn ghost" title="Desligar esta conversa da ficha do cliente (a conversa não é apagada)" aria-label="Desligar esta conversa da ficha do cliente" onClick={() => ligar(null)}><span aria-hidden="true">✕</span></button>}
                </> : conv && (ligando ? <BuscaCliente placeholder="Ligar a um cliente: nome ou CPF" onEscolher={(id) => ligar(id)} /> : <button className="btn" onClick={() => setLigando(true)}>Ligar a um cliente</button>)}
                {conv && <button className="btn ghost" title={conv.arquivada ? "Voltar a conversa para a lista principal" : "Tirar a conversa da lista principal (continua guardada)"} onClick={arquivar}>{conv.arquivada ? "Desarquivar" : "Arquivar"}</button>}
              </div>
            </header>
            {conv && <AgenteNaConversa conv={conv} onAtualizar={atualizar} onEnviada={juntar} />}
            {conv ? <FioWa msgs={msgs} carregando={carregando} /> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Nova conversa com {titulo}. Escreva abaixo.</div></div>}
            <CompositorWa conversaId={conv?.id || null} telefone={nova?.telefone || cli?.telefone} nome={nova?.nome} avulso={!cli || !!nova?.outroNumero} clienteId={nova?.clienteId} desativado={!conectado ? "WhatsApp desconectado: conecte em Configurações para enviar." : undefined}
              onEnviada={(m, id) => { if (!conv) { sb.from("wa_conversas").select("*").eq("id", id).single().then(({ data }: { data: WaConversa | null }) => { if (data) atualizar(data); setNova(null); setAtiva(id); }); } else juntar(m); }} />
          </> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Escolha uma conversa.</div></div>}
        </section>
      </div>
    </>
  );
}
export default function Pagina() { return <Suspense><WhatsApp /></Suspense>; }
