"use client";
// CRM: quadro pré-processual (atendimentos) e quadro judicial (processos por fase),
// com cartões que se arrastam entre as colunas, e a ficha do atendimento.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, nomeBonito } from "@/lib/formato";
import { mascaraCnj } from "@/lib/cnj";
import { situacaoPrazo } from "@/lib/prazos";
import { BANCOS, ETAPAS } from "@/lib/regras";
import type { Caso, Tarefa } from "@/lib/tipos";
import { Ic, Janela, SelResp, useConfirmar } from "./ui";
import { FormTarefa, TabelaTarefas } from "./tarefas";
import { useJanelas } from "./janelas";
import { CampoValores } from "./valores";
import { ProtocolarCaso } from "./FichaCliente";

/** arrasto dos cartões: segue o ponteiro, rola o quadro e a coluna nas bordas, solta em qualquer ponto da coluna */
export function useArrasto(onDrop: (id: string, coluna: string) => void) {
  const dr = useRef<{ id: string; el: HTMLElement; x0: number; y0: number; x: number; y: number; dx: number; dy: number; ghost?: HTMLElement; started: boolean; armed: boolean; pid: number; touch: boolean; alvo?: HTMLElement | null; raf?: number; hold?: ReturnType<typeof setTimeout> } | null>(null);
  const arrastou = useRef(false);
  const cb = useRef(onDrop); cb.current = onDrop;
  useEffect(() => {
    const colAlvo = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(".kcol") as HTMLElement | null;
    const fim = () => {
      const D = dr.current; if (!D) return;
      D.ghost?.remove(); D.el.classList.remove("arrastando"); document.querySelectorAll(".kcol.alvo").forEach((x) => x.classList.remove("alvo"));
      document.documentElement.classList.remove("arrastando"); if (D.raf) cancelAnimationFrame(D.raf); if (D.hold) clearTimeout(D.hold);
      if (D.started) { arrastou.current = true; setTimeout(() => (arrastou.current = false), 0); }
      dr.current = null;
    };
    const mover = () => {
      const D = dr.current; if (!D?.ghost) return;
      D.ghost.style.transform = `translate(${D.x - D.dx}px,${D.y - D.dy}px) rotate(1.5deg)`;
      const c = colAlvo(D.x, D.y); if (c !== D.alvo) { D.alvo?.classList.remove("alvo"); c?.classList.add("alvo"); D.alvo = c; }
    };
    const loop = () => {
      const D = dr.current; if (!D?.started) return;
      D.raf = requestAnimationFrame(() => {
        const D2 = dr.current; if (!D2?.started) return;
        const kb = document.querySelector(".kanban") as HTMLElement | null; const z = 70, vel = (d: number) => Math.ceil(((z - d) / z) * 22);
        if (kb) { const r = kb.getBoundingClientRect(); if (D2.x < r.left + z) kb.scrollLeft -= vel(D2.x - r.left); else if (D2.x > r.right - z) kb.scrollLeft += vel(r.right - D2.x); }
        const corpo = D2.alvo?.querySelector(".kbody") as HTMLElement | null;
        if (corpo) { const r = corpo.getBoundingClientRect(); if (D2.y < r.top + z && D2.y > r.top - 20) corpo.scrollTop -= vel(Math.max(0, D2.y - r.top)); else if (D2.y > r.bottom - z) corpo.scrollTop += vel(Math.max(0, r.bottom - D2.y)); }
        if (D2.y < z) window.scrollBy(0, -vel(D2.y)); else if (D2.y > innerHeight - z) window.scrollBy(0, vel(innerHeight - D2.y));
        mover(); loop();
      });
    };
    const comecar = () => {
      const D = dr.current; if (!D) return; const r = D.el.getBoundingClientRect(); D.dx = D.x0 - r.left; D.dy = D.y0 - r.top;
      const g = D.el.cloneNode(true) as HTMLElement; g.classList.add("ghost"); g.style.width = r.width + "px"; document.body.append(g); D.ghost = g;
      D.el.classList.add("arrastando"); document.documentElement.classList.add("arrastando"); D.started = true; mover(); loop();
    };
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest(".kcard") as HTMLElement | null;
      if (!el || e.button > 0 || (e.target as HTMLElement).closest("select,button,a,input,textarea")) return;
      dr.current = { id: el.dataset.id!, el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dx: 0, dy: 0, started: false, armed: e.pointerType !== "touch", pid: e.pointerId, touch: e.pointerType === "touch" };
      if (e.pointerType === "touch") dr.current.hold = setTimeout(() => { if (dr.current) { dr.current.armed = true; try { navigator.vibrate?.(15); } catch { /* sem vibração */ } comecar(); } }, 280);
    };
    const move = (e: PointerEvent) => {
      const D = dr.current; if (!D || e.pointerId !== D.pid) return; D.x = e.clientX; D.y = e.clientY;
      if (!D.started) { const d = Math.hypot(D.x - D.x0, D.y - D.y0); if (D.touch) { if (d > 10 && !D.armed) { if (D.hold) clearTimeout(D.hold); dr.current = null; } return; } if (d > 6) comecar(); return; }
      e.preventDefault(); mover();
    };
    const tmove = (e: TouchEvent) => { if (dr.current?.started) e.preventDefault(); };
    const up = () => {
      const D = dr.current; if (!D) return;
      if (D.started) { const c = colAlvo(D.x, D.y); const k = c?.dataset.k; const id = D.id; fim(); if (k != null) cb.current(id, k); return; }
      if (D.hold) clearTimeout(D.hold); dr.current = null;
    };
    const cancel = () => { if (dr.current?.started) fim(); else { if (dr.current?.hold) clearTimeout(dr.current.hold); dr.current = null; } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && dr.current?.started) fim(); };
    document.addEventListener("pointerdown", down); document.addEventListener("pointermove", move, { passive: false }); document.addEventListener("touchmove", tmove, { passive: false });
    document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("pointermove", move); document.removeEventListener("touchmove", tmove); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", esc); fim(); };
  }, []);
  return arrastou;
}

export function Coluna({ chave, titulo, dica, cartoes, extra }: { chave: string; titulo: string; dica?: string; cartoes: React.ReactNode[]; extra?: string }) {
  const [lim, setLim] = useState(40);
  return (
    <section className="kcol" data-k={chave}>
      <header className="kh"><span className="kt">{titulo}</span><span className="count">{cartoes.length}</span></header>
      {extra && <div className="kextra">{extra}</div>}
      {dica && <div className="kdica">{dica}</div>}
      <div className="kbody">{cartoes.slice(0, lim)}
        {cartoes.length > lim && <button className="btn ghost" onClick={() => setLim(lim + 40)}>Mostrar mais {Math.min(40, cartoes.length - lim)}</button>}
        <div className={"kvazio" + (cartoes.length ? " fim" : "")}>Solte aqui</div></div>
    </section>
  );
}

export function ProxTarefa({ t }: { t?: Tarefa }) {
  if (!t) return null; const s = situacaoPrazo(t.vencimento);
  return <div className="kt-tarefa"><span className={"pill " + s.cor}>{s.texto}</span><span className="ktt">{t.descricao}</span></div>;
}

/** ficha do atendimento pré-processual */
export function JanelaCaso({ id, comTarefa, onFechar, onTrocar }: { id: string; comTarefa?: boolean; onFechar: () => void; onTrocar: (id: string) => void }) {
  const { casos, clientes, tarefas, processos, sb, eu, aplicar, registrar, aviso, remover, titular } = useDados(); const j = useJanelas(); const router = useRouter(); const confirmar = useConfirmar();
  const novo = id === "novo"; const c: Partial<Caso> = novo ? {} : casos.get(id) || {};
  const [ed, setEd] = useState({ cliente_id: c.cliente_id || "", nome: c.nome || "", banco: c.banco || "", contratos: c.contratos || "", etapa: c.etapa || ETAPAS[0], responsavel: c.responsavel || eu.id, obs: c.obs || "" });
  const [tf, setTf] = useState(!!comTarefa);
  if (!novo && !casos.has(id)) return <Janela onFechar={onFechar} titulo="Atendimento"><div className="empty">Atendimento não encontrado.</div></Janela>;
  const ts = novo ? [] : [...tarefas.values()].filter((t) => t.caso_id === id).sort((a, b) => (a.vencimento || "9").localeCompare(b.vencimento || "9"));
  const cli = ed.cliente_id ? clientes.get(ed.cliente_id) : undefined;
  const salvar = async () => {
    const nome = (cli?.nome || ed.nome).trim(); if (!nome) { aviso("Informe o cliente."); return; }
    const dados = { cliente_id: ed.cliente_id || null, nome, banco: ed.banco.trim() || null, contratos: ed.contratos.trim() || null, etapa: ed.etapa, responsavel: ed.responsavel || null, obs: ed.obs || null };
    if (novo) {
      const { data, error } = await sb.from("casos").insert(dados).select().single();
      if (error) { aviso(msgErro(error)); return; }
      aplicar("casos", data); registrar({ caso_id: data.id, tipo: "caso_aberto", dados: { texto: "Atendimento aberto." } }); aviso("Atendimento cadastrado."); onTrocar(data.id);
    } else {
      const { data, error } = await sb.from("casos").update(dados).eq("id", id).select().single();
      if (error) { aviso(msgErro(error)); return; }
      aplicar("casos", data); if (c.etapa !== dados.etapa) registrar({ caso_id: id, tipo: "fase", dados: { fase: dados.etapa } }); aviso("Atendimento salvo.");
    }
  };
  return (
    <Janela onFechar={onFechar} titulo={novo ? "Novo atendimento" : nomeBonito(c.nome || "—")} sub={novo ? undefined : "Etapa: " + c.etapa}>
      <datalist id="dl-bancos">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
      <div className="form2">
        <label className="f full">Cliente<select value={ed.cliente_id} onChange={(e) => { const x = clientes.get(e.target.value); setEd({ ...ed, cliente_id: e.target.value, nome: x ? x.nome : ed.nome }); }}>
          <option value="">— cliente sem ficha (digite o nome abaixo) —</option>
          {[...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => <option key={x.id} value={x.id}>{nomeBonito(x.nome)}</option>)}</select></label>
        {!ed.cliente_id && <label className="f full">Nome do cliente<input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></label>}
        <label className="f">Banco réu<input list="dl-bancos" value={ed.banco} placeholder="Ex.: Banco C6 Consignado S.A." onChange={(e) => setEd({ ...ed, banco: e.target.value })} /></label>
        <label className="f">Contratos impugnados<input value={ed.contratos} placeholder="Nº dos contratos" onChange={(e) => setEd({ ...ed, contratos: e.target.value })} /></label>
        <label className="f">Etapa<select value={ed.etapa} onChange={(e) => setEd({ ...ed, etapa: e.target.value })}>{ETAPAS.filter((e) => e !== "Protocolado" || c.processo_numero).map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="f">Responsável pelo caso<SelResp valor={ed.responsavel} onChange={(v) => setEd({ ...ed, responsavel: v || "" })} /></label>
        <label className="f full">Observações<textarea rows={3} value={ed.obs} onChange={(e) => setEd({ ...ed, obs: e.target.value })} /></label>
      </div>
      <div className="tools">
        <button className="btn primary" onClick={salvar}>{novo ? "Cadastrar atendimento" : "Salvar"}</button>
        {!novo && cli && <Link className="btn ghost" href={"/clientes/" + cli.id} onClick={onFechar}>Ficha do cliente</Link>}
        {!novo && titular && <button className="btn ghost" onClick={async () => {
          const nts = ts.length; if (!confirmar("caso" + id, aviso, `Clique de novo em “Excluir” para confirmar.${nts ? ` As ${nts} tarefa(s) do atendimento também serão excluídas.` : ""}`)) return;
          const { error } = await sb.from("casos").delete().eq("id", id); if (error) { aviso(msgErro(error)); return; }
          remover("casos", id); for (const t of ts) remover("tarefas", t.id); aviso("Atendimento excluído."); onFechar();
        }}>Excluir</button>}
        {!novo && <button className="btn" onClick={() => j.abrirInicial({ clienteId: c.cliente_id || null, banco: c.banco || "", casoId: id })}>Petição inicial e pasta para protocolo</button>}
        {!novo && c.processo_numero && processos.has(c.processo_numero) && <button className="btn" onClick={() => j.abrirProcesso(c.processo_numero!)}>Abrir processo {mascaraCnj(c.processo_numero)}</button>}
      </div>
      {!novo && !c.processo_numero && <ProtocolarCaso casoId={id} />}
      {!novo && <CampoValores compacto valor={c.valor_causa} pct={c.honorarios_pct} onSalvar={async (v) => {
        const { data, error } = await sb.from("casos").update(v).eq("id", id).select().single();
        if (error) { aviso(/valor_causa|honorarios/.test(error.message) ? "Falta instalar a etapa 10 (0009_valores.sql) no Supabase." : msgErro(error)); return; } aplicar("casos", data); aviso("Valores salvos.");
      }} />}
      {!novo && <section className="panel"><div className="ph"><h3>Tarefas do atendimento</h3>
        <button className={tf ? "btn ghost" : "btn primary"} onClick={() => setTf(!tf)}>{tf ? "Fechar" : <>{Ic.tarefa}Criar tarefa</>}</button></div>
        {tf && <div style={{ padding: "12px 16px" }}><FormTarefa casoId={id} tipo="Elaboração de inicial" desc={"contra o " + (c.banco || "banco")} resp={c.responsavel || eu.id} onCriada={() => setTf(false)} /></div>}
        {ts.length ? <TabelaTarefas lista={ts} /> : <div className="empty">Nenhuma tarefa. Crie a de elaboração da inicial contra o banco.</div>}
      </section>}
      {!novo && <div className="muted" style={{ fontSize: 12.5 }}>Aberto em {dataBR((c.criado_em || "").slice(0, 10))}.</div>}
    </Janela>
  );
}
