"use client";
// WhatsApp do escritório dentro do sistema: conversas, mensagens em tempo real, envio e conexão pelo QR-code.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataHoraBR, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { useVisor } from "./visor";

export type WaConversa = { id: string; jid: string; telefone: string | null; nome: string | null; cliente_id: string | null; ultima_em: string; ultima_texto: string | null; nao_lidas: number; arquivada: boolean;
  atendimento?: "agente" | "equipe"; equipe_ate?: string | null; aguardando_equipe?: boolean; resumo?: string | null; rascunho?: string | null; rascunho_em?: string | null; saudado_em?: string | null };
export type WaMensagem = { id: string; conversa_id: string; wa_id: string | null; de_mim: boolean; texto: string | null; tipo: string; anexo: string | null; anexo_nome: string | null; anexo_mime: string | null; status: string | null; enviado_por: string | null; agente?: boolean; em: string };

// ───── conversas: uma só cópia para o menu e para a tela ─────
type SB = ReturnType<typeof useDados>["sb"];
const loja = { lista: new Map<string, WaConversa>(), v: 0, ouvintes: new Set<() => void>(), iniciado: false, falhou: false, carregado: false };
const avisar = () => { loja.v++; loja.ouvintes.forEach((f) => f()); };
function iniciar(sb: SB) {
  if (loja.iniciado) return; loja.iniciado = true;
  sb.from("wa_conversas").select("*").order("ultima_em", { ascending: false }).limit(800).then(({ data, error }: { data: WaConversa[] | null; error: unknown }) => {
    if (error) { loja.falhou = true; avisar(); return; }
    for (const c of data || []) loja.lista.set(c.id, c); loja.carregado = true; avisar();
  });
  sb.channel("wa-conversas").on("postgres_changes", { event: "*", schema: "public", table: "wa_conversas" }, (p: { eventType: string; new: WaConversa; old: { id: string } }) => {
    if (p.eventType === "DELETE") loja.lista.delete(p.old.id); else loja.lista.set(p.new.id, p.new); avisar();
  }).subscribe();
}
export function useWaConversas() {
  const { sb } = useDados();
  useEffect(() => { iniciar(sb); }, [sb]);
  const v = useSyncExternalStore((f) => { loja.ouvintes.add(f); return () => { loja.ouvintes.delete(f); }; }, () => loja.v, () => 0);
  const lista = useMemo(() => [...loja.lista.values()].sort((a, b) => b.ultima_em.localeCompare(a.ultima_em)), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const naoLidas = useMemo(() => lista.reduce((s, c) => s + (c.arquivada ? 0 : c.nao_lidas || 0), 0), [lista]);
  return { lista, naoLidas, semTabela: loja.falhou, carregado: loja.carregado, atualizar: (c: WaConversa) => { loja.lista.set(c.id, c); avisar(); } };
}

/** nome para mostrar: o do cliente; senão o do WhatsApp; senão o telefone */
export function useNomeConversa() {
  const { clientes } = useDados();
  return (c: WaConversa) => (c.cliente_id && clientes.get(c.cliente_id) ? nomeBonito(clientes.get(c.cliente_id)!.nome) : c.nome || foneBR(c.telefone) || "Contato");
}
export function foneBR(t?: string | null) {
  const d = String(t || "").replace(/\D/g, ""); if (!d) return "";
  const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : "+" + d;
}

/** mensagens de uma conversa, em tempo real */
export function useWaMensagens(conversaId: string | null) {
  const { sb } = useDados(); const [msgs, setMsgs] = useState<WaMensagem[]>([]); const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (!conversaId) { setMsgs([]); return; }
    let vivo = true; setCarregando(true);
    sb.from("wa_mensagens").select("*").eq("conversa_id", conversaId).order("em", { ascending: false }).limit(300).then(({ data }: { data: WaMensagem[] | null }) => { if (vivo) { setMsgs((data || []).sort((a, b) => a.em.localeCompare(b.em))); setCarregando(false); } });
    const ch = sb.channel("wa-msg-" + conversaId).on("postgres_changes", { event: "*", schema: "public", table: "wa_mensagens", filter: `conversa_id=eq.${conversaId}` }, (p: { eventType: string; new: WaMensagem }) => {
      if (p.eventType === "DELETE") return;
      setMsgs((l) => { const i = l.findIndex((x) => x.id === p.new.id); if (i >= 0) { const n = [...l]; n[i] = p.new; return n; } return [...l, p.new].sort((a, b) => a.em.localeCompare(b.em)); });
    }).subscribe();
    return () => { vivo = false; sb.removeChannel(ch); };
  }, [sb, conversaId]);
  const juntar = (m: WaMensagem) => setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
  return { msgs, carregando, juntar };
}

export async function enviarWhatsapp(corpo: { conversaId?: string; telefone?: string; nome?: string; avulso?: boolean; clienteId?: string; texto?: string; anexo?: { caminho: string; nome: string; mime: string }; origem?: "equipe" | "rascunho" | "aviso" }) {
  const r = await fetch("/api/whatsapp/enviar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || "Não consegui enviar pelo WhatsApp.");
  return j as { ok: true; mensagem: WaMensagem; conversaId: string };
}

// ───── conexão (QR-code) ─────
export function useConexaoWa() {
  const { config } = useDados(); const [st, setSt] = useState<{ configurado: boolean; estado: string; erro?: string } | null>(null);
  const consultar = () => fetch("/api/whatsapp/conectar").then((r) => r.json()).then(setSt).catch(() => setSt({ configurado: true, estado: "erro", erro: "Sem resposta do sistema." }));
  useEffect(() => { consultar(); }, []);
  const doWebhook = (config.whatsapp || {}) as { estado?: string; qr?: string | null; em?: string };
  useEffect(() => { if (doWebhook.estado) setSt((s) => (s ? { ...s, estado: doWebhook.estado === "qr" ? s.estado : doWebhook.estado! } : s)); }, [doWebhook.estado, doWebhook.em]);
  return { st, consultar, qrWebhook: doWebhook.estado === "qr" ? doWebhook.qr : null, conectado: st?.estado === "open" };
}

export function PainelConexao({ compacto }: { compacto?: boolean }) {
  const { titular, aviso } = useDados(); const { st, consultar, qrWebhook, conectado } = useConexaoWa();
  const [qr, setQr] = useState<string | null>(null); const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (qrWebhook) setQr(qrWebhook); }, [qrWebhook]);
  useEffect(() => { if (conectado) setQr(null); }, [conectado]);
  useEffect(() => { if (!qr) return; const t = setInterval(consultar, 4000); return () => clearInterval(t); }, [qr]); // eslint-disable-line react-hooks/exhaustive-deps
  const acao = async (a: "conectar" | "desconectar") => {
    setOcupado(true);
    try {
      const r = await fetch("/api/whatsapp/conectar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: a }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(j.erro || "Não consegui falar com o servidor do WhatsApp."); return; }
      if (a === "desconectar") { aviso("WhatsApp desconectado do sistema."); setQr(null); } else if (j.qr) setQr(j.qr); else if (j.estado === "open") aviso("WhatsApp já está conectado.");
      consultar();
    } finally { setOcupado(false); }
  };
  if (!st) return <div className="wa-con muted">Verificando a conexão do WhatsApp…</div>;
  if (!st.configurado) return (
    <div className="wa-con aviso"><strong>WhatsApp ainda não configurado.</strong> Falta o servidor da Evolution API e as variáveis na Vercel (EVOLUTION_URL, EVOLUTION_API_KEY e WHATSAPP_WEBHOOK_SECRET). Veja o passo a passo que o Claude passou.</div>);
  if (conectado) return compacto ? null : (
    <div className="wa-con ok"><span className="ponto-on" style={{ position: "static" }} /> <strong>WhatsApp conectado</strong> <span className="muted s">· as mensagens chegam aqui em tempo real</span>
      {titular && <button className="btn ghost" style={{ marginLeft: "auto" }} disabled={ocupado} onClick={() => acao("desconectar")}>Desconectar</button>}</div>);
  // o servidor da Evolution (Hostinger) não responde: não adianta QR-code, primeiro é preciso religar o servidor
  if (st.erro && /falar com o servidor|recusou a chave/i.test(st.erro)) return (
    <div className="wa-con aviso">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{/chave/i.test(st.erro) ? "O servidor do WhatsApp recusou a chave" : "O servidor do WhatsApp não está respondendo"}</strong>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={consultar}>Verificar de novo</button>
      </div>
      {/chave/i.test(st.erro) ? <div className="muted s">A chave EVOLUTION_API_KEY da Vercel não é a mesma do servidor. Confira as duas e faça um Redeploy na Vercel.</div>
        : <ol className="s" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Entre na Hostinger (hPanel) → <b>VPS</b> e veja se o servidor está <b>Em execução</b>. Se estiver parado, clique em <b>Iniciar</b>; se estiver ligado, clique em <b>Reiniciar</b>.</li>
          <li>Espere 2 a 3 minutos e clique em <b>Verificar de novo</b>. Normalmente o WhatsApp volta sozinho, sem ler o QR-code.</li>
          <li>Se voltar como “desconectado”, aí sim aparece o botão para ler o QR-code de novo.</li>
          <li>Confira também se o plano/teste do VPS não venceu (Hostinger → Cobrança).</li>
        </ol>}
    </div>);
  return (
    <div className="wa-con aviso">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong>WhatsApp desconectado</strong>{st.erro && <span className="muted s">{st.erro}</span>}
        {titular ? <button className="btn primary" style={{ marginLeft: "auto" }} disabled={ocupado} onClick={() => acao("conectar")}>{ocupado ? "Abrindo…" : qr ? "Gerar novo QR-code" : "Conectar pelo QR-code"}</button>
          : <span className="muted s" style={{ marginLeft: "auto" }}>Peça ao titular para conectar.</span>}
      </div>
      {qr && <div className="wa-qr"><img src={qr.startsWith("data:") ? qr : "data:image/png;base64," + qr} alt="QR-code do WhatsApp" width={240} height={240} />
        <ol><li>No celular do escritório, abra o WhatsApp.</li><li>Toque em <b>⋮ (ou Configurações) → Aparelhos conectados → Conectar um aparelho</b>.</li><li>Aponte a câmera para este QR-code. Ele muda a cada poucos segundos: se expirar, gere de novo.</li></ol></div>}
    </div>
  );
}

// ───── mensagens ─────
const SINAL: Record<string, [string, string, string]> = { enviando: ["◷", "", "Enviando"], enviada: ["✓", "", "Enviada"], entregue: ["✓✓", "", "Entregue"], lida: ["✓✓", "lida", "Lida"], erro: ["⚠", "erro", "Não enviada"] };
const ROT_TIPO: Record<string, string> = { imagem: "📷 Ver foto", video: "🎥 Ver vídeo", audio: "🎤 Ouvir áudio", documento: "📄 Abrir documento", figurinha: "Ver figurinha", outro: "Ver" };

export function FioWa({ msgs, carregando }: { msgs: WaMensagem[]; carregando: boolean }) {
  const { nome, aviso } = useDados(); const visor = useVisor(); const ref = useRef<HTMLDivElement>(null); const [abrindo, setAbrindo] = useState("");
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);
  const abrir = async (m: WaMensagem) => {
    setAbrindo(m.id);
    try {
      const r = await fetch("/api/whatsapp/midia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.caminho) { aviso(j.erro || "Não consegui abrir o arquivo."); return; }
      if (/^audio\//.test(j.mime || "") && j.url) { window.open(j.url, "_blank", "noopener"); return; }
      visor.verGuardado(j.caminho, j.nome || "arquivo", j.mime);
    } finally { setAbrindo(""); }
  };
  let dia = ""; const hoje = hojeBR();
  return (
    <div className="chat-fio" ref={ref}>
      {carregando && !msgs.length && <div className="muted" style={{ margin: "auto" }}>Carregando…</div>}
      {!carregando && !msgs.length && <div className="muted" style={{ margin: "auto" }}>Nenhuma mensagem ainda.</div>}
      {msgs.map((m) => {
        const d = new Date(m.em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); const sep = d !== dia; dia = d;
        const s = m.de_mim ? SINAL[m.status || "enviada"] : null;
        return [sep && <div key={"d" + m.id} className="chat-dia">{d === hoje ? "Hoje" : dataHoraBR(m.em).slice(0, 10)}</div>,
          <div key={m.id} className={"msg" + (m.de_mim ? " meu" : "")}><div className="bolha">
            {m.de_mim && <div className="mquem">{m.agente ? "🤖 Assistente" + (m.enviado_por ? " · enviado por " + nome(m.enviado_por).split(" ")[0] : "") : m.enviado_por ? nome(m.enviado_por).split(" ")[0] : "Celular / Atende Direito"}</div>}
            {m.tipo !== "texto" && <button className="reflink" disabled={abrindo === m.id} onClick={() => abrir(m)}>{abrindo === m.id ? "Abrindo…" : (m.anexo_nome && m.tipo === "documento" ? "📄 " + m.anexo_nome : ROT_TIPO[m.tipo] || "Ver")}</button>}
            {m.texto && <div className="mtexto">{m.texto}</div>}
            <div className="mhora">{dataHoraBR(m.em).slice(11)}{s && <span className={"msinal " + s[1]} title={s[2]}>{s[0]}</span>}</div>
          </div></div>];
      })}
    </div>
  );
}

export function CompositorWa({ conversaId, telefone, nome, avulso, clienteId, onEnviada, desativado }: { conversaId: string | null; telefone?: string | null; nome?: string; avulso?: boolean; clienteId?: string; onEnviada: (m: WaMensagem, conversaId: string) => void; desativado?: string }) {
  const { sb, eu, aviso } = useDados(); const [t, setT] = useState(""); const [arq, setArq] = useState<File | null>(null); const [enviando, setEnviando] = useState(false);
  const envia = async () => {
    const x = t.trim(); if ((!x && !arq) || enviando || desativado) return;
    setEnviando(true);
    try {
      let anexo: { caminho: string; nome: string; mime: string } | undefined;
      if (arq) {
        if (arq.size > 15 * 1024 * 1024) { aviso("Arquivo maior que 15 MB."); return; }
        const caminho = `whatsapp/saida/${eu.id}/${Date.now()}-${arq.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80)}`;
        const up = await sb.storage.from("documentos").upload(caminho, arq, { contentType: arq.type || undefined });
        if (up.error) { aviso("Não consegui enviar o arquivo: " + up.error.message); return; }
        anexo = { caminho, nome: arq.name, mime: arq.type || "application/octet-stream" };
      }
      const r = await enviarWhatsapp(conversaId ? { conversaId, texto: x, anexo } : { telefone: telefone || "", nome, avulso, clienteId, texto: x, anexo });
      setT(""); setArq(null); onEnviada(r.mensagem, r.conversaId);
    } catch (e) { aviso(msgErro(e, (e as Error).message)); }
    finally { setEnviando(false); }
  };
  return (
    <div className="chat-comp-w"><div className="chat-comp">
      <label className="icb" title="Anexar foto ou documento">📎<input type="file" hidden onChange={(e) => { setArq(e.target.files?.[0] || null); e.target.value = ""; }} /></label>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {arq && <span className="anexo"><span className="an">{arq.name}</span><button className="btn ghost" onClick={() => setArq(null)}>Tirar</button></span>}
        <textarea rows={1} value={t} disabled={!!desativado} placeholder={desativado || "Mensagem pelo WhatsApp do escritório… (Enter envia, Shift+Enter quebra linha)"} onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envia(); } }} style={{ resize: "vertical", minHeight: 40 }} />
      </div>
      <button className="btn primary" disabled={enviando || !!desativado || (!t.trim() && !arq)} onClick={envia}>{enviando ? "Enviando…" : "Enviar"}</button>
    </div></div>
  );
}

/** busca de cliente para ligar a conversa ou iniciar uma nova */
export function BuscaCliente({ onEscolher, placeholder, soComTelefone }: { onEscolher: (id: string) => void; placeholder: string; soComTelefone?: boolean }) {
  const { clientes } = useDados(); const [q, setQ] = useState("");
  const n = semAcento(q.trim());
  const res = n.length < 2 ? [] : [...clientes.values()].filter((c) => (!soComTelefone || c.telefone) && (semAcento(c.nome).includes(n) || (c.cpf || "").replace(/\D/g, "").includes(n.replace(/\D/g, "") || "#"))).slice(0, 8);
  return (
    <div className="wa-busca">
      <input autoFocus value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && <div className="wa-busca-res">{res.map((c) => <button key={c.id} onClick={() => { onEscolher(c.id); setQ(""); }}><b>{nomeBonito(c.nome)}</b><span className="muted s">{[c.cpf, foneBR(c.telefone)].filter(Boolean).join(" · ") || "sem telefone"}</span></button>)}</div>}
    </div>
  );
}

/** a conversa de WhatsApp de um cliente (na tarefa e no aviso): últimas mensagens e resposta rápida */
export function WhatsappDoCliente({ clienteId, inicioAberto }: { clienteId: string; inicioAberto?: boolean }) {
  const { clientes, config } = useDados(); const { lista } = useWaConversas(); const [aberto, setAberto] = useState(!!inicioAberto);
  const cli = clientes.get(clienteId);
  const doCliente = lista.filter((c) => c.cliente_id === clienteId); const [sel, setSel] = useState<string | null>(null);
  const conv = doCliente.find((c) => c.id === sel) || doCliente[0] || null;
  const { msgs, carregando, juntar } = useWaMensagens(aberto ? conv?.id || null : null);
  const ligado = (config.whatsapp as { estado?: string } | undefined)?.estado === "open";
  if (!cli) return null;
  return (
    <div className="tj-corr wa-cli">
      <div className="tj-corr-h" style={{ cursor: "pointer" }} onClick={() => setAberto(!aberto)}>
        <strong>{aberto ? "▾" : "▸"} WhatsApp do cliente</strong>
        <span className="muted s">{conv ? (conv.ultima_texto ? "última: " + conv.ultima_texto.slice(0, 60) : "conversa aberta") : cli.telefone ? "nenhuma mensagem ainda · " + foneBR(cli.telefone) : "sem telefone na ficha"}</span>
        {doCliente.reduce((s, c) => s + (c.nao_lidas || 0), 0) > 0 && <span className="count hot">{doCliente.reduce((s, c) => s + (c.nao_lidas || 0), 0)}</span>}
        {conv && <a className="reflink" style={{ marginLeft: "auto" }} href={"/whatsapp?c=" + conv.id} onClick={(e) => e.stopPropagation()}>abrir no WhatsApp ↗</a>}
      </div>
      {aberto && doCliente.length > 1 && <div className="wa-chips">{doCliente.map((c) => <button key={c.id} className={"pill" + (c.id === conv?.id ? " acc" : "")} onClick={() => setSel(c.id)}>{c.nome || foneBR(c.telefone)}{c.nao_lidas ? ` (${c.nao_lidas})` : ""}</button>)}</div>}
      {aberto && <div className="wa-cli-corpo">
        {conv ? <FioWa msgs={msgs.slice(-8)} carregando={carregando} /> : <div className="muted s" style={{ padding: 8 }}>{cli.telefone ? "Ainda não há conversa com este cliente. A mensagem abaixo abre a conversa." : "Cadastre o telefone na ficha do cliente para conversar."}</div>}
        {(conv || cli.telefone) && <CompositorWa conversaId={conv?.id || null} telefone={cli.telefone} desativado={!ligado ? "WhatsApp do sistema desconectado." : undefined} onEnviada={(m) => { if (conv) juntar(m); }} />}
      </div>}
    </div>
  );
}
