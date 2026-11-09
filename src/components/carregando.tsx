"use client";
// Retorno visual enquanto o sistema trabalha: esqueleto da página, barra de progresso entre páginas,
// "Salvando…" no topo, aviso de falta de internet e tela de erro com "Tentar de novo".
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { instalarAtividade, ouvirAtividade, type Atividade } from "@/lib/atividade";

/** esqueleto da página (título, cartões e painéis) enquanto os dados chegam */
export function Esqueleto({ lento, onTentar, rotulo = "Carregando a página…" }: { lento?: boolean; onTentar?: () => void; rotulo?: string }) {
  return (
    <div className="esq" aria-busy="true" aria-live="polite">
      <span className="sr-only">{rotulo}</span>
      <div className="sk sk-tit" /><div className="sk sk-sub" />
      <div className="esq-stats">{[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-stat" />)}</div>
      {[0, 1].map((i) => <div key={i} className="esq-painel"><div className="sk sk-ph" />{[0, 1, 2, 3].map((j) => <div key={j} className="esq-linha"><div className="sk sk-pill" /><div style={{ flex: 1 }}><div className="sk sk-l1" /><div className="sk sk-l2" /></div></div>)}</div>)}
      {lento && <div className="esq-lento" role="status">Está demorando mais que o normal. A conexão pode estar lenta.{onTentar && <button className="btn ghost" onClick={onTentar}>Tentar de novo</button>}</div>}
    </div>
  );
}

/** carga inicial: mostra o esqueleto e, se passar de 10 s, avisa que está lento */
export function CarregandoInicial({ onTentar }: { onTentar: () => void }) {
  const [lento, setLento] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLento(true), 10000); return () => clearTimeout(t); }, []);
  return <Esqueleto rotulo="Carregando os dados do escritório…" lento={lento} onTentar={() => { setLento(false); onTentar(); }} />;
}

/** a carga falhou e não há nada para mostrar: em vez de telas vazias (que parecem "sem tarefas"), explica e oferece tentar de novo */
export function ErroCarga({ onTentar }: { msg?: string; onTentar: () => Promise<void> }) {
  const [tentando, setTentando] = useState(false);
  return (
    <div className="erro-carga" role="alert">
      <strong>Não consegui carregar os dados do escritório.</strong>
      <span className="muted">Confira a internet e tente de novo. Nada foi perdido: os dados continuam guardados no servidor.</span>
      <button className="btn primary" disabled={tentando} aria-busy={tentando} onClick={async () => { setTentando(true); try { await onTentar(); } finally { setTentando(false); } }}>{tentando ? "Tentando…" : "Tentar de novo"}</button>
    </div>
  );
}

/** barra fina no topo enquanto a próxima página carrega (começa no clique, termina quando a página troca) */
export function BarraNavegacao() {
  const p = usePathname(); const sp = useSearchParams(); const chave = p + "?" + sp.toString();
  const [fase, setFase] = useState<"" | "on" | "fim">(""); const tm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href); if (u.origin !== location.origin) return;
      if (u.pathname + u.search === location.pathname + location.search) return;
      setFase("on"); if (tm.current) clearTimeout(tm.current); tm.current = setTimeout(() => setFase(""), 15000);
    };
    document.addEventListener("click", clique);
    return () => document.removeEventListener("click", clique);
  }, []);
  useEffect(() => { setFase((f) => (f === "on" ? "fim" : f)); const t = setTimeout(() => setFase((f) => (f === "fim" ? "" : f)), 350); return () => clearTimeout(t); }, [chave]);
  return <div className={"nav-progresso" + (fase ? " " + fase : "")} data-nav-progresso={fase === "on" ? "on" : ""} role="progressbar" aria-label="Carregando a página" aria-hidden={fase !== "on"} />;
}

/** "Salvando…" no topo enquanto uma ação da pessoa está indo para o servidor (aparece só se passar de 0,4 s) */
export function IndicadorAtividade() {
  const [a, setA] = useState<Atividade>({ pendentes: 0, tipo: "salvar", desde: 0 }); const [ver, setVer] = useState(false); const [, tic] = useState(0);
  useEffect(() => { instalarAtividade(); return ouvirAtividade(setA); }, []);
  useEffect(() => {
    if (!a.pendentes) { setVer(false); return; }
    const t = setTimeout(() => setVer(true), 400); const r = setInterval(() => tic((x) => x + 1), 1000);
    return () => { clearTimeout(t); clearInterval(r); };
  }, [a.pendentes]);
  const longo = a.pendentes && Date.now() - a.desde > 12000;
  const txt = a.tipo === "arquivo" ? "Enviando arquivo…" : a.tipo === "processar" ? "Processando…" : "Salvando…";
  return <span className={"salvando-ind" + (ver && a.pendentes ? " on" : "")} role="status" aria-live="polite">{ver && a.pendentes ? <><span className="pt" aria-hidden="true" />{longo ? txt.replace("…", "") + ", ainda trabalhando…" : txt}</> : ""}</span>;
}

/** faixa quando a internet cai; ao voltar, recarrega os dados para não ficar nada desatualizado */
export function FaixaRede({ onVoltou }: { onVoltou: () => void }) {
  const [off, setOff] = useState(false); const [voltou, setVoltou] = useState(false);
  useEffect(() => {
    setOff(typeof navigator !== "undefined" && navigator.onLine === false);
    const sai = () => { setOff(true); setVoltou(false); };
    const volta = () => { setOff(false); setVoltou(true); onVoltou(); setTimeout(() => setVoltou(false), 3500); };
    window.addEventListener("offline", sai); window.addEventListener("online", volta);
    return () => { window.removeEventListener("offline", sai); window.removeEventListener("online", volta); };
  }, [onVoltou]);
  if (off) return <div className="faixa-rede" role="alert">Sem conexão com a internet. O que você fizer agora não será salvo; assim que a conexão voltar, os dados são atualizados.</div>;
  if (voltou) return <div className="faixa-rede ok" role="status">Conexão restabelecida. Dados atualizados.</div>;
  return null;
}

/** cronômetro "1:23" enquanto algo demorado está rodando */
export function useCronometro(ativo: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => { if (!ativo) { setS(0); return; } const t0 = Date.now(); const x = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(x); }, [ativo]);
  return ativo ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
}

/** tempo decorrido ("1:23") ao lado do texto de uma operação demorada; conta a partir de quando aparece */
export function Cronometro() {
  const t = useCronometro(true);
  return <span className="cron mono" aria-hidden="true">{t}</span>;
}

/**
 * Protege um pedaço da tela: se algo dentro dele quebrar, mostra o aviso com "Tentar de novo" ali mesmo,
 * em vez de derrubar o sistema inteiro ("Application error").
 */
export class Protecao extends Component<{ children: ReactNode; onFechar?: () => void; janela?: boolean }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidCatch(erro: Error, info: ErrorInfo) { console.error("[tela] erro capturado:", erro, info.componentStack); }
  render() {
    if (!this.state.erro) return this.props.children;
    const caixa = (
      <div className="panel" role="alert" style={{ padding: 20, maxWidth: 520, margin: this.props.janela ? 0 : "24px auto" }}>
        <h3 style={{ marginTop: 0 }}>Esta parte da tela teve um problema</h3>
        <p className="muted">Nada foi perdido. Tente de novo; se continuar, feche e abra outra vez. Detalhe técnico: {this.state.erro.message}</p>
        <div className="tools"><button className="btn primary" onClick={() => this.setState({ erro: null })}>Tentar de novo</button>
          {this.props.onFechar && <button className="btn ghost" onClick={() => { this.setState({ erro: null }); this.props.onFechar!(); }}>Fechar</button>}</div>
      </div>);
    return this.props.janela ? <><div className="drawer-bg" onClick={this.props.onFechar} /><aside className="drawer" role="dialog" aria-modal="true">{caixa}</aside></> : caixa;
  }
}
