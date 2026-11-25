"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataHoraBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { intervalo, PERIODOS } from "@/lib/protocolos";
import { limitesISO, resumirEnviadas, type MsgEnviada } from "@/lib/enviadas";
import { pdfEnviadas } from "@/lib/enviadasPdf";
import { useJanelas } from "@/components/janelas";
import { AgenteNaConversa } from "@/components/agente";
import { Ic, baixar } from "@/components/ui";
import { BuscaCliente, ClaudeNaConversa, CompositorWa, FioWa, PainelConexao, foneBR, useConexaoWa, useNomeConversa, useWaConversas, useWaMensagens, type WaConversa } from "@/components/whatsapp";

type Filtro = "todas" | "naolidas" | "equipe" | "clientes" | "sem";

function WhatsApp() {
  const sp = useSearchParams(); const { sb, clientes, processos, aviso, aplicar } = useDados(); const j = useJanelas();
  const { lista, semTabela, atualizar, carregado: loaded, temMais: maisConvs, maisCarregando: carregandoConvs, carregarMais: maisConversas } = useWaConversas(); const nomeDe = useNomeConversa(); const { conectado } = useConexaoWa();
  const [ativa, setAtiva] = useState<string | null>(sp.get("c")); const [aberto, setAberto] = useState(!!sp.get("c"));
  const [q, setQ] = useState(""); const [filtro, setFiltro] = useState<Filtro>("todas"); const [verEnviadas, setVerEnviadas] = useState(false);
  const [nova, setNova] = useState<{ clienteId?: string; telefone?: string; nome?: string; outroNumero?: boolean } | null>(null); const [modoNova, setModoNova] = useState<"cliente" | "avulso">("cliente"); const [av, setAv] = useState({ fone: "", nome: "", cadastrar: true, clienteId: "" }); const [criando, setCriando] = useState(false); const [ligando, setLigando] = useState(false); const [claudeAberto, setClaudeAberto] = useState(false); const [rascunho, setRascunho] = useState<{ texto: string; n: number; conv: string } | null>(null); const [textoCx, setTextoCx] = useState(""); const [buscaNova, setBuscaNova] = useState(false);
  useEffect(() => { setClaudeAberto(false); }, [ativa]); // trocar de conversa fecha o pedido ao Claude
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
  const { msgs, carregando, juntar, temMais, maisCarregando, anteriores, erro: erroMsgs, tentar } = useWaMensagens(conv?.id || null);
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
        <button className="btn ghost" style={{ marginLeft: "auto" }} aria-expanded={verEnviadas} title="Ver as mensagens que uma pessoa da equipe enviou, da mais recente para a mais antiga" onClick={() => setVerEnviadas(!verEnviadas)}>{verEnviadas ? "Fechar enviadas" : "Enviadas por…"}</button>
        <button className="btn" onClick={() => { setBuscaNova(!buscaNova); }}>{buscaNova ? "Cancelar" : "+ Nova conversa"}</button></div>
      <PainelConexao compacto />
      {verEnviadas && <EnviadasPor onAbrir={(id) => { setAtiva(id); setNova(null); setAberto(true); }} />}
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
          {maisConvs && <button className="btn ghost wa-anteriores" disabled={carregandoConvs} aria-busy={carregandoConvs} onClick={maisConversas}>{carregandoConvs ? "Carregando conversas mais antigas…" : "Carregar conversas mais antigas"}</button>}
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
            {conv ? <FioWa msgs={msgs} carregando={carregando} temMais={temMais} maisCarregando={maisCarregando} onAnteriores={anteriores} erro={erroMsgs} onTentar={tentar} /> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Nova conversa com {titulo}. Escreva abaixo.</div></div>}
            {conv && claudeAberto && <ClaudeNaConversa key={"claude-" + conv.id} conversaId={conv.id} textoAtual={textoCx} onFechar={() => setClaudeAberto(false)} onEscrito={(t) => setRascunho((x) => ({ texto: t, n: (x?.n || 0) + 1, conv: conv.id }))} />}
            <CompositorWa key={"compor-" + (conv?.id || "nova")} acaoExtra={conv && <button type="button" className={"icb wa-claude-bt" + (claudeAberto ? " on" : "")} aria-pressed={claudeAberto} title="Escrever com o Claude: ele lê a conversa e o processo do cliente; você confere antes de enviar (usa créditos)" aria-label="Escrever com o Claude" onClick={() => setClaudeAberto(!claudeAberto)}>{Ic.claude}</button>} rascunho={rascunho && rascunho.conv === conv?.id ? rascunho : undefined} onTexto={setTextoCx} conversaId={conv?.id || null} telefone={nova?.telefone || cli?.telefone} nome={nova?.nome} avulso={!cli || !!nova?.outroNumero} clienteId={nova?.clienteId} desativado={!conectado ? "WhatsApp desconectado: conecte em Configurações para enviar." : undefined}
              onEnviada={(m, id) => { if (!conv) { sb.from("wa_conversas").select("*").eq("id", id).single().then(({ data }: { data: WaConversa | null }) => { if (data) atualizar(data); setNova(null); setAtiva(id); }); } else juntar(m); }} />
          </> : <div className="chat-fio"><div className="muted" style={{ margin: "auto" }}>Escolha uma conversa.</div></div>}
        </section>
      </div>
    </>
  );
}
type Enviada = { id: string; conversa_id: string; texto: string | null; tipo: string; anexo_nome: string | null; em: string; agente: boolean | null };
const ROT_ANEXO: Record<string, string> = { imagem: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", documento: "📄 Documento", figurinha: "Figurinha" };

/** filtro "Enviadas por": as mensagens que uma pessoa da equipe mandou pelo WhatsApp do escritório, da mais recente para a mais antiga */
function EnviadasPor({ onAbrir }: { onAbrir: (conversaId: string) => void }) {
  const { sb, equipe, eu, aviso } = useDados(); const { lista } = useWaConversas(); const nomeDe = useNomeConversa();
  const ativos = equipe.filter((p) => p.ativo);
  const [pessoa, setPessoa] = useState(() => (ativos.find((p) => p.id !== eu.id && /amanda/i.test(p.nome)) || ativos.find((p) => p.id !== eu.id) || eu).id);
  const [ms, setMs] = useState<Enviada[] | null>(null); const [fim, setFim] = useState(false); const [extra, setExtra] = useState<Map<string, WaConversa>>(new Map());
  const POR = 30;
  const buscar = async (de: number) => {
    const r = await sb.from("wa_mensagens").select("id,conversa_id,texto,tipo,anexo_nome,em,agente").eq("enviado_por", pessoa).eq("de_mim", true).order("em", { ascending: false }).range(de, de + POR - 1);
    if (r.error) { aviso(msgErro(r.error)); return; }
    const novas = (r.data || []) as Enviada[]; setFim(novas.length < POR); setMs((v) => (de ? [...(v || []), ...novas] : novas));
    // conversas que ainda não estão na lista carregada (lista vem paginada)
    const faltam = [...new Set(novas.map((m) => m.conversa_id))].filter((id) => !lista.some((c) => c.id === id) && !extra.has(id));
    if (faltam.length) { const { data } = await sb.from("wa_conversas").select("*").in("id", faltam); if (data) setExtra((m) => { const n = new Map(m); for (const c of data as WaConversa[]) n.set(c.id, c); return n; }); }
  };
  useEffect(() => { setMs(null); buscar(0); }, [pessoa]); // eslint-disable-line react-hooks/exhaustive-deps
  const conversa = (id: string) => lista.find((c) => c.id === id) || extra.get(id);
  // relatório em PDF do período escolhido
  const hoje = hojeBR(); const [per, setPer] = useState("semana"); const [pde, setPde] = useState(hoje.slice(0, 8) + "01"); const [pate, setPate] = useState(hoje); const [gerando, setGerando] = useState(false);
  const exportar = async () => {
    const lim = per === "hoje" ? { de: hoje, ate: hoje } : intervalo(per, hoje, pde, pate);
    if (!lim.de || !lim.ate || lim.de > lim.ate) { aviso("Escolha um período válido."); return; }
    setGerando(true);
    try {
      const { ini, fim: ate } = limitesISO(lim.de, lim.ate); const todas: MsgEnviada[] = [];
      for (let de = 0; ; de += 1000) {
        const r = await sb.from("wa_mensagens").select("id,conversa_id,texto,tipo,anexo_nome,em,agente").eq("enviado_por", pessoa).eq("de_mim", true).gte("em", ini).lte("em", ate).order("em", { ascending: false }).range(de, de + 999);
        if (r.error) throw r.error; todas.push(...((r.data || []) as MsgEnviada[])); if ((r.data || []).length < 1000) break;
      }
      const convs = new Map<string, WaConversa>([...lista, ...extra.values()].map((c) => [c.id, c]));
      const faltam = [...new Set(todas.map((m) => m.conversa_id))].filter((id) => !convs.has(id));
      for (let i = 0; i < faltam.length; i += 200) { const { data } = await sb.from("wa_conversas").select("*").in("id", faltam.slice(i, i + 200)); for (const c of (data || []) as WaConversa[]) convs.set(c.id, c); }
      const quem = nomeBonito(ativos.find((p) => p.id === pessoa)?.nome || "");
      const rotPer = per === "hoje" ? "Hoje" : (PERIODOS.find((x) => x[0] === per)?.[1] || "Período").replace(/^Protocolados /, "").replace(/^n/, "N").replace("Escolher período…", "Período");
      const r = resumirEnviadas(todas, lim.de, lim.ate, hoje);
      const pdf = await pdfEnviadas({ pessoa: quem, periodo: rotPer, de: lim.de, ate: lim.ate, r, msgs: todas, nomeConversa: (id) => { const c = convs.get(id); return c ? nomeDe(c) : "Conversa"; }, emitidoPor: nomeBonito(eu.nome) });
      baixar(`Mensagens enviadas - ${quem} - ${lim.de} a ${lim.ate}.pdf`, new Blob([pdf as BlobPart], { type: "application/pdf" }), "application/pdf");
      aviso(`Relatório gerado: ${r.total} mensagem(ns) para ${r.conversas} cliente(s).`);
    } catch (e) { aviso(msgErro(e, (e as Error).message)); }
    finally { setGerando(false); }
  };
  return (
    <div className="panel wa-env">
      <div className="wa-env-h"><strong>Mensagens enviadas por</strong>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa da equipe">{ativos.map((p) => <option key={p.id} value={p.id}>{nomeBonito(p.nome)}{p.id === eu.id ? " (você)" : ""}</option>)}</select>
        <span className="muted s">da mais recente para a mais antiga · clique para abrir a conversa</span>
        <span className="wa-env-pdf">
          <select value={per} onChange={(e) => setPer(e.target.value)} aria-label="Período do relatório">
            <option value="hoje">Hoje</option><option value="semana">Esta semana</option><option value="semana_passada">Semana passada</option>
            <option value="mes">Este mês</option><option value="mes_passado">Mês passado</option><option value="periodo">Escolher período…</option></select>
          {per === "periodo" && <><input type="date" value={pde} max={pate} onChange={(e) => setPde(e.target.value)} aria-label="De" /><input type="date" value={pate} min={pde} onChange={(e) => setPate(e.target.value)} aria-label="Até" /></>}
          <button className="btn" disabled={gerando} onClick={exportar} title="Baixar o relatório em PDF: resumo, mensagens por dia e a lista das mensagens">{gerando ? "Gerando…" : "Exportar PDF"}</button>
        </span></div>
      {!ms ? <div className="muted s">Carregando…</div> : !ms.length ? <div className="empty">Nenhuma mensagem enviada por essa pessoa.</div> : <>
        <ul className="wa-env-l">{ms.map((m) => { const c = conversa(m.conversa_id); return (
          <li key={m.id}><button onClick={() => onAbrir(m.conversa_id)} title="Abrir a conversa">
            <span className="wa-env-q"><b>{c ? nomeDe(c) : "Conversa"}</b><span className="muted s">{dataHoraBR(m.em)}{m.agente ? " · pelo assistente" : ""}</span></span>
            <span className="wa-env-t">{m.tipo !== "texto" ? (m.anexo_nome ? "📄 " + m.anexo_nome : ROT_ANEXO[m.tipo] || m.tipo) + (m.texto ? " · " : "") : ""}{m.texto || ""}</span>
          </button></li>); })}</ul>
        {!fim && <button className="btn ghost" onClick={() => buscar(ms.length)}>Ver mais antigas</button>}
      </>}
    </div>
  );
}

export default function Pagina() { return <Suspense><WhatsApp /></Suspense>; }
