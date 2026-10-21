"use client";
// Janelas abertas por cima de qualquer tela: publicação, aviso ao cliente, nova tarefa,
// atendimento do CRM e petição inicial. Uma abre por cima da outra; "Fechar" volta à anterior.
import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, nomeBonito, semAcento } from "@/lib/formato";
import { soDigitos } from "@/lib/cnj";
import { Janela } from "./ui";
import { FormTarefa } from "./tarefas";
import { JanelaPublicacao } from "./publicacoes";
import { BlocoAviso } from "./avisos";
import { JanelaCaso } from "./crm";
import { JanelaInicial, type CtxInicial } from "./peticao";
import { JanelaPeca, type CtxPeca } from "./peca";
import { JanelaCumprimento, type CtxCumprimento } from "./cumprimento";
import { JanelaProcesso, type FocoProcesso } from "./processo";
import { JanelaTarefa } from "./tarefa-janela";
import { JanelaNovoCliente, JanelaNovoProcesso, type CtxNovoProcesso } from "./novos";
import { JanelaCliente } from "./FichaCliente";

type Aberta = { k: "pub"; id: number } | { k: "aviso"; id: string } | { k: "tarefa"; numero?: string } | { k: "caso"; id: string; tarefa?: boolean } | { k: "inicial"; ctx: CtxInicial } | { k: "peca"; ctx: CtxPeca } | { k: "cumprimento"; ctx: CtxCumprimento } | { k: "processo"; numero: string; foco?: FocoProcesso } | { k: "verTarefa"; id: string } | { k: "novoProcesso"; ctx: CtxNovoProcesso } | { k: "novoCliente" } | { k: "cliente"; id: string };
type Ctx = {
  abrirPub: (id: number) => void; abrirAviso: (id: string) => void; novaTarefa: (numero?: string) => void;
  abrirCaso: (id: string, comTarefa?: boolean) => void; abrirInicial: (ctx: CtxInicial) => void; gerarPeca: (ctx: CtxPeca) => void; gerarCumprimento: (ctx: CtxCumprimento) => void; abrirProcesso: (numero: string, foco?: FocoProcesso) => void; abrirTarefa: (id: string) => void; novoProcesso: (ctx?: CtxNovoProcesso) => void; novoCliente: () => void; abrirCliente: (id: string) => void; fechar: () => void;
};
const C = createContext<Ctx | null>(null);
export function useJanelas() { const c = useContext(C); if (!c) throw new Error("useJanelas fora do provedor"); return c; }

export function ProvedorJanelas({ children }: { children: React.ReactNode }) {
  const [pilha, setPilha] = useState<Aberta[]>([]); const { processos } = useDados();
  const abrir = useCallback((a: Aberta) => setPilha((p) => [...p, a]), []);
  const fechar = useCallback(() => setPilha((p) => p.slice(0, -1)), []);
  const trocar = useCallback((a: Aberta | null) => setPilha((p) => (a ? [...p.slice(0, -1), a] : p.slice(0, -1))), []);
  const v: Ctx = {
    abrirPub: (id) => abrir({ k: "pub", id }), abrirAviso: (id) => abrir({ k: "aviso", id }), novaTarefa: (numero) => abrir({ k: "tarefa", numero }),
    abrirCaso: (id, tarefa) => abrir({ k: "caso", id, tarefa }), abrirInicial: (ctx) => abrir({ k: "inicial", ctx }), gerarPeca: (ctx) => abrir({ k: "peca", ctx }), gerarCumprimento: (ctx) => abrir({ k: "cumprimento", ctx }), abrirProcesso: (numero, foco) => abrir({ k: "processo", numero, foco }), abrirTarefa: (id) => abrir({ k: "verTarefa", id }), novoProcesso: (ctx) => abrir({ k: "novoProcesso", ctx: ctx || {} }), novoCliente: () => abrir({ k: "novoCliente" }), abrirCliente: (id) => abrir({ k: "cliente", id }), fechar,
  };
  const topo = pilha[pilha.length - 1];
  return (
    <C.Provider value={v}>
      {children}
      {topo?.k === "pub" && <JanelaPublicacao key="pub" id={topo.id} onFechar={fechar} onTrocar={(id) => trocar(id == null ? null : { k: "pub", id })} />}
      {topo?.k === "aviso" && <JanelaAviso id={topo.id} onFechar={fechar} />}
      {topo?.k === "tarefa" && <JanelaNovaTarefa numero={topo.numero} onFechar={fechar} />}
      {topo?.k === "caso" && <JanelaCaso key={topo.id} id={topo.id} comTarefa={topo.tarefa} onFechar={fechar} onTrocar={(id) => trocar({ k: "caso", id })} />}
      {topo?.k === "inicial" && <JanelaInicial ctx={topo.ctx} onFechar={fechar} onIntermediaria={(numero) => trocar({ k: "peca", ctx: { numero } })} onCumprimento={(numero) => trocar({ k: "cumprimento", ctx: { numero } })} />}
      {topo?.k === "cumprimento" && <JanelaCumprimento key={topo.ctx.numero} ctx={topo.ctx} onFechar={fechar} onIntermediaria={topo.ctx.tarefaId ? undefined : (numero) => trocar({ k: "peca", ctx: { numero } })} onInicial={topo.ctx.tarefaId ? undefined : () => { const p = topo.ctx.numero; const pr = processos.get(p); trocar({ k: "inicial", ctx: { clienteId: pr?.cliente_id || null, banco: pr?.banco, numero: p } }); }} />}
      {topo?.k === "peca" && <JanelaPeca ctx={topo.ctx} onFechar={fechar} onCumprimento={(numero) => trocar({ k: "cumprimento", ctx: { numero } })} onInicial={topo.ctx.tarefaId || topo.ctx.publicacaoId ? undefined : () => { const p = topo.ctx.numero; const pr = processos.get(p); trocar({ k: "inicial", ctx: { clienteId: pr?.cliente_id || null, banco: pr?.banco, numero: p } }); }} />}
      {topo?.k === "novoProcesso" && <JanelaNovoProcesso ctx={topo.ctx} onFechar={fechar} onCriado={(n) => trocar(topo.ctx.voltar ? null : { k: "processo", numero: n })} onCaso={(id) => trocar({ k: "caso", id })} />}
      {topo?.k === "novoCliente" && <JanelaNovoCliente onFechar={fechar} />}
      {topo?.k === "cliente" && <JanelaCliente key={topo.id} id={topo.id} onFechar={fechar} />}
      {topo?.k === "verTarefa" && <JanelaTarefa key={topo.id} id={topo.id} onFechar={fechar} />}
      {topo?.k === "processo" && <JanelaProcesso key={topo.numero} numero={topo.numero} foco={topo.foco} onFechar={fechar} />}
    </C.Provider>
  );
}

function JanelaAviso({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { avisos, processos } = useDados(); const abrirProc = useJanelas().abrirProcesso;
  const av = avisos.get(id); const p = av ? processos.get(av.processo_numero) : undefined;
  if (!av) return <Janela onFechar={onFechar} titulo="Aviso ao cliente"><div className="empty">Aviso não encontrado.</div></Janela>;
  return (
    <Janela onFechar={onFechar} titulo={nomeBonito(p?.cliente_nome || "—")} sub={<span className="mono">{p?.mascara || ""}</span>}
      acoes={p && <button className="btn ghost" onClick={() => abrirProc(p.numero)}>Ver processo</button>}>
      <BlocoAviso key={av.id} av={av} inicioAberto />
    </Janela>
  );
}

function JanelaNovaTarefa({ numero: inicial, onFechar }: { numero?: string; onFechar: () => void }) {
  const { processos, eu } = useDados();
  const [numero, setNumero] = useState(inicial || ""); const [q, setQ] = useState("");
  const p = numero ? processos.get(numero) : undefined;
  const n = semAcento(q), dg = soDigitos(q);
  const achados = !p && (n.length >= 2 || dg.length >= 4) ? [...processos.values()].filter((x) => semAcento(x.cliente_nome).includes(n) || (dg.length >= 4 && x.numero.includes(dg))).slice(0, 8) : [];
  return (
    <Janela onFechar={onFechar} titulo="Nova tarefa">
      {p ? <div className="tools"><div><div style={{ fontWeight: 700 }}>{nomeBonito(p.cliente_nome || "—")}</div><div className="mono muted">{p.mascara} · {p.orgao || ""}</div></div>
        <button className="btn ghost" onClick={() => setNumero("")}>Trocar processo</button></div>
        : <label className="f">Processo (cliente ou número)<input type="search" autoFocus value={q} placeholder="Digite o nome do cliente ou parte do número" onChange={(e) => setQ(e.target.value)} /></label>}
      {achados.length > 0 && <div className="panel"><div className="rows">{achados.map((x) => (
        <div key={x.numero} className="row click" onClick={() => setNumero(x.numero)}><span className="pill">{bancoCurto(x.banco)}</span>
          <div className="main"><div className="t">{nomeBonito(x.cliente_nome || "—")}</div><div className="s mono">{x.mascara}</div></div><span /></div>))}</div></div>}
      {!p && q.length >= 2 && !achados.length && <div className="muted">Nenhum processo encontrado. Para um caso que ainda não virou processo, crie a tarefa pelo atendimento no CRM.</div>}
      {p && <FormTarefa key={p.numero} numero={p.numero} resp={p.responsavel || eu.id} onCriada={onFechar} />}
    </Janela>
  );
}
