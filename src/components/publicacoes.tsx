"use client";
// Publicação do DJEN: texto, análise do Claude, criar tarefa, avisar o cliente e concluir a análise.
import Link from "next/link";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { ATOS_AGENDA, FASES, MODALIDADES, atoPub, avisoDaAnalise, descDaAnalise, faseCRM, prazoDaPublicacao, precisaAvisar, rotuloPub } from "@/lib/regras";
import { hojeBR } from "@/lib/prazos";
import { situacaoPrazo } from "@/lib/prazos";
import type { Analise, Aviso, Modalidade, Publicacao } from "@/lib/tipos";
import { BlocoTexto, Ic, Janela, useConfirmar } from "./ui";
import { FormTarefa, MiniTarefa } from "./tarefas";
import { BlocoAviso, useCriarAviso } from "./avisos";
import { FormAgendar, resumoAto } from "./agenda";
import { useJanelas } from "./janelas";

export function CaixaAnalise({ a }: { a: Analise }) {
  return (
    <div className="ai">
      {a.intimarCliente && <div style={{ fontWeight: 700, color: "var(--soon)" }}>Cliente precisa ser avisado{a.evento?.data ? `: ${a.evento.tipo || "ato"} em ${dataBR(a.evento.data)}${a.evento.hora ? " às " + a.evento.hora : ""}` : ""}</div>}
      <div><strong>{a.ato || "Ato"}</strong>{a.tarefa ? " · " + a.tarefa : ""}{a.prazoDias ? " · " + a.prazoDias + " dias úteis" : ""}</div>
      {a.resumo && <div>{a.resumo}</div>}
      {a.providencia && <div><span className="muted">Providência: </span>{a.providencia}</div>}
      {a.obs && <div className="muted">{a.obs}</div>}
    </div>
  );
}

/** pede ao Claude a análise de uma ou mais publicações (até 10 por vez) */
export function useAnalisar() {
  const { aplicar, aviso } = useDados();
  const [ocupado, setOcupado] = useState<Set<number>>(new Set());
  const analisar = async (pubs: Publicacao[]) => {
    const ids = pubs.map((p) => p.id);
    setOcupado((s) => new Set([...s, ...ids]));
    try {
      const r = await fetch("/api/claude/analisar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(j.erro || "A análise falhou. Tente de novo."); return null; }
      for (const p of j.publicacoes || []) aplicar("caixa", p);
      for (const a of j.avisos || []) aplicar("avisos", a);
      return j.publicacoes as Publicacao[];
    } catch { aviso("A análise falhou. Verifique a internet e tente de novo."); return null; }
    finally { setOcupado((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; }); }
  };
  return { analisar, ocupado };
}

export function linksEproc(link: string | null | undefined, aviso: (m: string) => void) {
  if (!link) return null;
  return <>
    <a className="btn ghost" href={link} target="_blank" rel="noopener noreferrer" title="Abre numa aba separada">Abrir no eproc ↗</a>
    <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(link); aviso("Link copiado. Cole no seu navegador."); } catch { aviso("Copie o link: " + link); } }}>Copiar link</button>
  </>;
}

/** conteúdo da publicação com todas as ações (usado na caixa e na linha do tempo) */
export function CorpoPublicacao({ pub, faseEscolhida, setFase, comFase, analisando, onAnalisar, mostrarTexto = true, onAbrirAviso }: {
  pub: Publicacao; faseEscolhida?: string; setFase?: (f: string) => void; comFase?: boolean; analisando: boolean; onAnalisar: () => void; mostrarTexto?: boolean;
  /** na linha do tempo o aviso aparece só como link que abre a janela do aviso */
  onAbrirAviso?: (id: string) => void;
}) {
  const d = useDados(); const { tarefas, avisos, processos, eu, aviso, sb, aplicar, registrar } = d;
  const criarAviso = useCriarAviso();
  const [form, setForm] = useState(false); const [agendar, setAgendar] = useState(false);
  const a = pub.analise as Analise | null; const p = processos.get(pub.processo_numero);
  const ts = [...tarefas.values()].filter((t) => t.publicacao_id === pub.id).sort((x, y) => (x.vencimento || "").localeCompare(y.vencimento || ""));
  const av = [...avisos.values()].find((x) => x.publicacao_id === pub.id);
  // agendamento que o Claude encontrou na intimação (audiência ou coleta com data): salva com um clique
  const ev = a?.evento; const [salvandoAg, setSalvandoAg] = useState(false);
  const texto = pub.texto || "";
  const tipoAg = ev?.tipo && ATOS_AGENDA.includes(ev.tipo) ? ev.tipo : /coleta|padr[aã]o\s+(de\s+)?assinatura|colhid[oa]s?\s+(o\s+)?(material|assinatura|padr)|material de prova/i.test(texto) && ev?.data ? ATOS_AGENDA[1] : /audi[eê]ncia/i.test(ev?.tipo || "") ? ATOS_AGENDA[0] : null;
  const modAg: Modalidade | null = ev?.modalidade && ev.modalidade in MODALIDADES ? ev.modalidade as Modalidade
    : /videoconfer|sala virtual|zoom|teams|link de acesso/i.test(texto) ? "video" : ev?.hora ? "jf_agendado" : ev?.data ? "jf_balcao" : null;
  const dataAg = /^\d{4}-\d\d-\d\d$/.test(ev?.data || "") ? ev!.data! : null;
  const sugestao = tipoAg && dataAg && modAg && !av?.modalidade ? { tipo_evento: tipoAg, modalidade: modAg, data_evento: dataAg, hora: modAg === "jf_balcao" ? null : (ev?.hora || "").slice(0, 5) || null,
    local: modAg === "video" ? null : ev?.local || p?.orgao || null, orientacoes: ev?.orientacoes || null } : null;
  const salvarSugestao = async () => {
    if (!sugestao) return; setSalvandoAg(true);
    try {
      let id = av?.id || null;
      if (!id) id = await criarAviso({ processo_numero: pub.processo_numero, publicacao_id: pub.id });
      if (!id) return;
      const { data, error } = await sb.from("avisos_cliente").update({ ...sugestao, realizado_em: null }).eq("id", id).select().single();
      if (error) { aviso(msgErro(error)); return; }
      aplicar("avisos", data);
      registrar({ processo_numero: pub.processo_numero, publicacao_id: pub.id, tipo: "ato_agendado", dados: { texto: resumoAto(data as Aviso) + (modAg !== "jf_balcao" ? " em " + dataBR(dataAg!) : "") + " (pela análise do Claude)" } });
      aviso("Agendado. Aparece no Painel, em Audiências e coletas, e na Agenda.");
    } finally { setSalvandoAg(false); }
  };
  const mudarFase = async () => {
    if (!faseEscolhida || !p || faseEscolhida === (p.fase || "")) return;
    const { data, error } = await sb.from("processos").update({ fase: faseEscolhida }).eq("numero", p.numero).select().single();
    if (error) { aviso(msgErro(error)); return; }
    aplicar("processos", data); registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: faseEscolhida } });
  };
  return (
    <div className="pub">
      {mostrarTexto && <BlocoTexto texto={pub.texto} />}
      {a ? <CaixaAnalise a={a} /> : analisando ? <div className="ai">O Claude está lendo a publicação…</div> : null}
      {sugestao && !agendar && <div className="sug-ag">
        <div><strong>📅 O Claude encontrou um agendamento nesta intimação</strong>
          <div>{sugestao.tipo_evento} · {MODALIDADES[sugestao.modalidade].curto} · {sugestao.modalidade === "jf_balcao" ? "até " : ""}{dataBR(sugestao.data_evento)}{sugestao.hora ? " às " + sugestao.hora : ""}</div>
          {sugestao.local && <div className="muted s">{sugestao.local}</div>}
          {sugestao.orientacoes && <div className="muted s">{sugestao.orientacoes}</div>}
          {sugestao.data_evento < hojeBR() && <div className="s" style={{ color: "var(--late)" }}>Atenção: a data já passou. Confira na intimação antes de salvar.</div>}</div>
        <div className="tools"><button className="btn primary" disabled={salvandoAg} onClick={salvarSugestao}>{salvandoAg ? "Salvando…" : "✓ Salvar agendamento"}</button>
          <button className="btn ghost" onClick={() => setAgendar(true)}>Ajustar antes</button></div>
      </div>}
      <div className="acts">
        <button className={form ? "btn ghost" : "btn primary"} onClick={() => setForm(!form)}>{form ? "Fechar" : <>{Ic.tarefa}Criar tarefa</>}</button>
        <button className={!av?.modalidade && precisaAvisar(pub) ? "btn primary" : "btn"} onClick={() => setAgendar(!agendar)}>{agendar ? "Fechar agendamento" : av?.modalidade ? "Editar agendamento" : "📅 Agendar audiência / coleta"}</button>
        {!av && <button className={precisaAvisar(pub) ? "btn wa" : "btn ghost"} onClick={async () => { const id = await criarAviso({ processo_numero: pub.processo_numero, publicacao_id: pub.id, ...(a?.intimarCliente ? avisoDaAnalise(a) : {}) }); if (id && onAbrirAviso) onAbrirAviso(id); }}>Avisar o cliente</button>}
        {!a && <button className="btn" disabled={analisando} onClick={onAnalisar}>{Ic.claude}{analisando ? "Analisando…" : "Analisar com Claude"}</button>}
        {linksEproc(pub.link, aviso)}
      </div>
      {agendar && <FormAgendar numero={pub.processo_numero} pub={pub} av={av} onFim={() => setAgendar(false)} />}
      {av?.modalidade && !agendar && <div className="ato-ag"><span className="pill acc">📅 {resumoAto(av)}{av.modalidade !== "jf_balcao" && av.data_evento ? " · " + dataBR(av.data_evento) : ""}</span><span className="muted">no Painel › Audiências e coletas</span></div>}
      {ts.length > 0 && <div className="tarefas-pub"><div className="lbl">Tarefas criadas a partir desta publicação</div>{ts.map((t) => <MiniTarefa key={t.id} t={t} />)}</div>}
      {av && (onAbrirAviso ? <button className="reflink" onClick={() => onAbrirAviso(av.id)}>{av.status === "avisado" ? "✓ Cliente avisado" : av.status === "dispensado" ? "Sem aviso ao cliente (não precisa)" : "⚠ Cliente ainda não avisado: abrir aviso"}</button> : <BlocoAviso key={av.id} av={av} />)}
      {form && <FormTarefa numero={pub.processo_numero} pub={{ id: pub.id, data: pub.data, eproc: pub.eproc }} tipo={a?.tarefa} desc={descDaAnalise(a)} dias={a?.prazoDias}
        resp={p?.responsavel || eu.id} aoCriar={mudarFase} onCriada={() => setForm(false)}
        extra={comFase && setFase ? <label className="f">Fase do processo<select value={faseEscolhida ?? ""} onChange={(e) => setFase(e.target.value)}><option value="">— manter —</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label> : null} />}
    </div>
  );
}

/** janela grande da caixa: uma publicação por vez, com Anterior / Próxima e "Concluir análise" */
export function JanelaPublicacao({ id, onFechar, onTrocar }: { id: number; onFechar: () => void; onTrocar: (id: number | null) => void }) {
  const d = useDados(); const { caixa, processos, tarefas, avisos, sb, aplicar, remover, registrar, aviso, eu } = d;
  const { analisar, ocupado } = useAnalisar(); const confirmar = useConfirmar(); const j = useJanelas();
  const lista = [...caixa.values()].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  const i = lista.findIndex((x) => x.id === id); const pub = lista[i];
  const p = pub ? processos.get(pub.processo_numero) : undefined;
  const [fases, setFases] = useState<Record<number, string>>({});
  if (!pub) return <Janela onFechar={onFechar} titulo="Publicação"><div className="empty"><strong>Publicação já analisada.</strong>Ela saiu da caixa.</div></Janela>;
  const a = pub.analise as Analise | null;
  const fase = fases[pub.id] ?? (faseCRM(p?.fase) || a?.fase || "");
  const avPub = [...avisos.values()].find((x) => x.publicacao_id === pub.id);
  const concluir = async (semAviso = false) => {
    const ts = [...tarefas.values()].filter((t) => t.publicacao_id === pub.id); const av = avPub;
    if (semAviso && av && av.status === "pendente") {
      const r = await sb.from("avisos_cliente").update({ status: "dispensado" }).eq("id", av.id).select().single();
      if (r.error) { aviso(/check/i.test(r.error.message) ? "Falta instalar a etapa 0012 (0012_aviso_dispensado.sql) no Supabase." : msgErro(r.error)); return; }
      aplicar("avisos", r.data); registrar({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "aviso_dispensado", dados: { texto: "Não precisa avisar o cliente" } });
    }
    if (av && av.status === "pendente" && !semAviso && !confirmar("c" + pub.id, aviso, "O cliente ainda não foi avisado. O aviso continua pendente no Painel. Clique de novo para concluir.")) return;
    if (fases[pub.id] && p && fases[pub.id] !== (p.fase || "")) {
      const r = await sb.from("processos").update({ fase: fases[pub.id] }).eq("numero", p.numero).select().single();
      if (!r.error) { aplicar("processos", r.data); registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: fases[pub.id] } }); }
    }
    const { error } = await sb.from("publicacoes").update({ triagem: "concluida", concluida_em: new Date().toISOString(), concluida_por: eu.id }).eq("id", pub.id);
    if (error) { aviso(msgErro(error)); return; }
    const partes = [ts.length ? ts.length + (ts.length === 1 ? " tarefa criada" : " tarefas criadas") : "só ciência, sem tarefa", av ? (av.status === "avisado" || semAviso ? (av.status === "avisado" ? "cliente avisado" : "sem aviso ao cliente") : av.status === "dispensado" ? "sem aviso ao cliente" : "aviso ao cliente pendente") : ""].filter(Boolean);
    registrar({ processo_numero: pub.processo_numero, publicacao_id: pub.id, tipo: "analise_concluida", dados: { origem: rotuloPub(pub), texto: partes.join(" · ") } });
    const prox = lista[i + 1] || lista[i - 1];
    remover("caixa", pub.id); onTrocar(prox ? prox.id : null);
    aviso("Análise concluída" + (ts.length ? ". As tarefas seguem na Agenda." : "."));
  };
  return (
    <Janela largo onFechar={onFechar} titulo={p ? nomeBonito(p.cliente_nome || "—") : "Processo " + pub.processo_numero} sub={`${i + 1} de ${lista.length} na caixa`}
      acoes={<>
        <button className="btn primary" title="A publicação sai da caixa; tarefas e avisos continuam" onClick={() => concluir()}>✓ Concluir análise</button>
        {avPub?.status === "pendente" && <button className="btn" title="Conclui a análise e marca que este cliente não precisa ser avisado" onClick={() => concluir(true)}>Concluir sem avisar o cliente</button>}
        <button className="btn ghost" disabled={i <= 0} onClick={() => onTrocar(lista[i - 1].id)}>‹ Anterior</button>
        <button className="btn ghost" disabled={i >= lista.length - 1} onClick={() => onTrocar(lista[i + 1].id)}>Próxima ›</button>
      </>}>
      <div className="pub">
        <div className="top"><div><span className="who">{nomeBonito(p?.cliente_nome || "—")}</span> <span className="muted">x {bancoCurto(p?.banco)}</span></div>
          <div className="tools">{(() => { const pr = prazoDaPublicacao(pub, [...tarefas.values()].filter((t) => t.publicacao_id === pub.id)); if (!pr.venc) return null; const sp = situacaoPrazo(pr.venc);
            return <span className={"pill " + sp.cor} title={pr.origem === "analise" ? "Prazo estimado pela análise do Claude" : "Prazo da tarefa"}>prazo {dataBR(pr.venc)} · {sp.texto}</span>; })()}<span className="pill">{atoPub(pub)}</span><span className="mono muted">{dataBR(pub.data)}</span></div></div>
        <div className="s"><span className="num-copia"><span className="mono">{p?.mascara || pub.processo_numero}</span><button title="Copiar o número do processo" aria-label="Copiar o número do processo" onClick={async (e) => { e.stopPropagation(); const n = p?.mascara || pub.processo_numero; try { await navigator.clipboard.writeText(n); aviso("Número copiado: " + n); } catch { aviso(n); } }}><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/></svg></button></span> · {pub.orgao || ""}{pub.eproc ? " · intimação pelo eproc" : ""}
          {p && <> · <button className="reflink" onClick={() => j.abrirProcesso(p.numero, { aba: "intimacoes", alvo: "pub-" + pub.id })}>Ver processo</button></>}</div>
        <div className="txt">{pub.texto || "(sem texto)"}</div>
      </div>
      <CorpoPublicacao key={pub.id} pub={pub} mostrarTexto={false} comFase faseEscolhida={fase} setFase={(f) => setFases({ ...fases, [pub.id]: f })}
        analisando={ocupado.has(pub.id)} onAnalisar={() => analisar([pub])} />
    </Janela>
  );
}
