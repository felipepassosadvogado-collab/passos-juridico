"use client";
import { useEffect, useRef, useState } from "react";
import { useDados, useOpcoesEquipe } from "@/lib/dados";
import { iniciais } from "@/lib/formato";

/** ícones de traço, no mesmo desenho do painel antigo */
export const Ic = {
  tarefa: <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M8 5.5v5M5.5 8h5" /></svg>,
  claude: <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M8 1.5l1.2 3.6 3.8.1-3 2.3 1.1 3.7L8 9l-3.1 2.2 1.1-3.7-3-2.3 3.8-.1z" /></svg>,
  busca: <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" /></svg>,
  filtro: <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2 3h12l-4.5 5.5V13l-3 1.2V8.5z" /></svg>,
  ordem: <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 4h11M2.5 8h7.5M2.5 12h4" /></svg>,
  exportar: <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2.5h-6v11h9v-6" /><path d="M8 8l6-6M10.5 2h3.5v3.5" /></svg>,
  estrela: (cheia: boolean) => <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z" fill={cheia ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
};

/** janela sobre a tela (o "drawer" do painel antigo); fecha com Esc ou clicando fora */
export function Janela({ aberta = true, onFechar, largo, titulo, sub, acoes, children }: {
  aberta?: boolean; onFechar: () => void; largo?: boolean; titulo: React.ReactNode; sub?: React.ReactNode; acoes?: React.ReactNode; children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", k); document.body.classList.add("sem-rolagem");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("sem-rolagem"); };
  }, [aberta, onFechar]);
  const chave = typeof titulo === "string" ? titulo : "";
  useEffect(() => { if (aberta) ref.current?.scrollTo({ top: 0 }); }, [aberta, chave]);
  if (!aberta) return null;
  return (
    <>
      <div className="drawer-bg" onClick={onFechar} />
      <aside ref={ref} className={"drawer" + (largo ? " largo" : "")} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <div className="dh">
          <div style={{ minWidth: 0 }}><h2>{titulo}</h2>{sub && <div className="muted">{sub}</div>}</div>
          <div className="tools">{acoes}<button className="btn ghost" onClick={onFechar}>Fechar</button></div>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Avatar({ id, nome, pequeno, grande }: { id?: string | null; nome?: string; pequeno?: boolean; grande?: boolean }) {
  const { nome: n, equipe } = useDados();
  const t = nome ?? n(id); const foto = id ? equipe.find((p) => p.id === id)?.foto : null;
  return <span className={"avr" + (pequeno ? " sm" : "") + (grande ? " lg" : "") + (foto ? " foto" : "")} title={t}>{foto ? <img src={foto} alt="" loading="lazy" /> : id || nome ? iniciais(t) : "?"}</span>;
}
/** só o conteúdo do círculo (foto ou iniciais), para círculos com estilo próprio */
export function RostoOuIniciais({ id }: { id?: string | null }) {
  const { nome, equipe } = useDados(); const foto = id ? equipe.find((p) => p.id === id)?.foto : null;
  return foto ? <img className="rosto" src={foto} alt="" loading="lazy" /> : <>{id ? iniciais(nome(id)) : "?"}</>;
}
export function ChipResp({ id }: { id?: string | null }) {
  const { nome, eu } = useDados();
  return <span className={"chip" + (id ? "" : " vazio")}><span className="av"><RostoOuIniciais id={id} /></span>{id ? (id === eu.id ? "Você" : nome(id)) : "Sem responsável"}</span>;
}

export function SelResp({ valor, onChange, vazio = "Sem responsável", excluir, id }: { valor: string | null; onChange: (v: string | null) => void; vazio?: string | null; excluir?: string[]; id?: string }) {
  const ops = useOpcoesEquipe().filter((o) => !excluir?.includes(o.id));
  return (
    <select id={id} value={valor || ""} onChange={(e) => onChange(e.target.value || null)}>
      {vazio !== null && <option value="">{vazio}</option>}
      {ops.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  );
}

/** texto longo recolhido, com "Mostrar a publicação inteira" */
export function BlocoTexto({ texto }: { texto?: string | null }) {
  const t = texto || "(sem texto)";
  const longo = t.length > 700 || t.split("\n").length > 9;
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className={"txt" + (longo && !aberto ? " clamp" : "")}>{t}</div>
      {longo && <button className="mais" onClick={() => setAberto(!aberto)}>{aberto ? "Recolher" : "Mostrar a publicação inteira"}</button>}
    </div>
  );
}

/** confirmação de dois cliques para ações que apagam algo */
export function useConfirmar() {
  const [pendente, setPendente] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (chave: string, aviso: (m: string) => void, msg: string) => {
    if (pendente === chave) { setPendente(null); return true; }
    setPendente(chave); aviso(msg);
    if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setPendente(null), 6000);
    return false;
  };
}

/** baixa um texto ou blob como arquivo */
export function baixar(nome: string, dados: Blob | string, tipo = "text/plain;charset=utf-8") {
  const blob = typeof dados === "string" ? new Blob([dados], { type: tipo }) : dados;
  const u = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = u; a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export const tamanhoBR = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
