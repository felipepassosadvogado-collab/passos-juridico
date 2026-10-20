"use client";
// Publicação do DJEN: texto, análise do Claude, criar tarefa, avisar o cliente e concluir a análise.
import Link from "next/link";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { FASES, atoPub, avisoDaAnalise, descDaAnalise, faseCRM, precisaAvisar, rotuloPub } from "@/lib/regras";
import type { Analise, Publicacao } from "@/lib/tipos";
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
      {av && (onAbrirAviso ? <button className="reflink" onClick={() => onAbrirAviso(av.id)}>{av.status === "avisado" ? "✓ Cliente avisado" : "⚠ Cliente ainda não avisado: abrir aviso"}</button> : <BlocoAviso key={av.id} av={av} />)}
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
  const concluir = async () => {
    const ts = [...tarefas.values()].filter((t) => t.publicacao_id === pub.id); const av = [...avisos.values()].find((x) => x.publicacao_id === pub.id);
    if (av && av.status !== "avisado" && !confirmar("c" + pub.id, aviso, "O cliente ainda não foi avisado. O aviso continua pendente no Painel. Clique de novo para concluir.")) return;
    if (fases[pub.id] && p && fases[pub.id] !== (p.fase || "")) {
      const r = await sb.from("processos").update({ fase: fases[pub.id] }).eq("numero", p.numero).select().single();
      if (!r.error) { aplicar("processos", r.data); registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: fases[pub.id] } }); }
    }
    const { error } = await sb.from("publicacoes").update({ triagem: "concluida", concluida_em: new Date().toISOString(), concluida_por: eu.id }).eq("id", pub.id);
    if (error) { aviso(msgErro(error)); return; }
    const partes = [ts.length ? ts.length + (ts.length === 1 ? " tarefa criada" : " tarefas criadas") : "só ciência, sem tarefa", av ? (av.status === "avisado" ? "cliente avisado" : "aviso ao cliente pendente") : ""].filter(Boolean);
    registrar({ processo_numero: pub.processo_numero, publicacao_id: pub.id, tipo: "analise_concluida", dados: { origem: rotuloPub(pub), texto: partes.join(" · ") } });
    const prox = lista[i + 1] || lista[i - 1];
    remover("caixa", pub.id); onTrocar(prox ? prox.id : null);
    aviso("Análise concluída" + (ts.length ? ". As tarefas seguem em Atividades." : "."));
  };
  return (
    <Janela largo onFechar={onFechar} titulo={p ? nomeBonito(p.cliente_nome || "—") : "Processo " + pub.processo_numero} sub={`${i + 1} de ${lista.length} na caixa`}
      acoes={<>
        <button className="btn primary" title="A publicação sai da caixa; tarefas e avisos continuam" onClick={concluir}>✓ Concluir análise</button>
        <button className="btn ghost" disabled={i <= 0} onClick={() => onTrocar(lista[i - 1].id)}>‹ Anterior</button>
        <button className="btn ghost" disabled={i >= lista.length - 1} onClick={() => onTrocar(lista[i + 1].id)}>Próxima ›</button>
      </>}>
      <div className="pub">
        <div className="top"><div><span className="who">{nomeBonito(p?.cliente_nome || "—")}</span> <span className="muted">x {bancoCurto(p?.banco)}</span></div>
          <div className="tools"><span className="pill">{atoPub(pub)}</span><span className="mono muted">{dataBR(pub.data)}</span></div></div>
        <div className="s"><span className="mono">{p?.mascara || pub.processo_numero}</span> · {pub.orgao || ""}{pub.eproc ? " · intimação pelo eproc" : ""}
          {p && <> · <button className="reflink" onClick={() => j.abrirProcesso(p.numero, { aba: "intimacoes", alvo: "pub-" + pub.id })}>Ver processo</button></>}</div>
        <div className="txt">{pub.texto || "(sem texto)"}</div>
      </div>
      <CorpoPublicacao key={pub.id} pub={pub} mostrarTexto={false} comFase faseEscolhida={fase} setFase={(f) => setFases({ ...fases, [pub.id]: f })}
        analisando={ocupado.has(pub.id)} onAnalisar={() => analisar([pub])} />
    </Janela>
  );
}
