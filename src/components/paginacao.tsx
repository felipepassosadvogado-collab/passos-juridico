"use client";
// Paginação das tabelas: página e tamanho da página ficam no endereço (voltar, recarregar e compartilhar o link
// mantêm a posição) e o tamanho escolhido é lembrado neste navegador. Não muda nenhum dado nem filtro.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { numerosPagina, recorte, TAMANHOS } from "@/lib/lista";

const lerUrl = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));
/** grava no endereço sem recarregar a página nem buscar nada no servidor */
function gravarUrl(pares: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(pares)) { if (v == null || v === "") u.searchParams.delete(k); else u.searchParams.set(k, v); }
  const novo = u.pathname + (u.search ? u.search : "") + u.hash;
  if (novo !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", novo);
}

/** um filtro/busca guardado no endereço (?chave=valor): sobrevive a voltar e recarregar */
export function useFiltroUrl(chave: string, padrao = ""): [string, (v: string) => void] {
  // as páginas com lista só montam no navegador (depois de carregar os dados), então dá para ler o endereço já no início
  const [v, setV] = useState(() => lerUrl(chave) ?? padrao);
  const set = useCallback((x: string) => { setV(x); gravarUrl({ [chave]: x === padrao ? null : x }); }, [chave, padrao]);
  return [v, set];
}

/**
 * Estado da paginação de uma lista. "assinatura" = filtros/busca atuais: quando mudam, volta para a página 1.
 * "id" separa listas diferentes no endereço (ex.: pag-processos) e no tamanho lembrado.
 */
export function usePaginacao(id: string, total: number, assinatura: string, padrao = 50, naUrl = true) {
  const kP = "pag", kT = "por"; const kLocal = "lista.tamanho." + id;
  const [pagina, setPag] = useState(() => (naUrl && Number(lerUrl(kP))) || 1);
  const [porPagina, setPor] = useState(() => {
    let t = naUrl ? Number(lerUrl(kT)) : 0;
    if (!t) { try { t = Number(localStorage.getItem(kLocal)) || 0; } catch { /* sem armazenamento */ } }
    return (TAMANHOS as readonly number[]).includes(t) ? t : padrao;
  });
  // filtro ou busca mudou: volta para a página 1 (a página de antes pode nem existir mais)
  const assAnt = useRef(assinatura);
  useEffect(() => {
    if (assAnt.current === assinatura) return; assAnt.current = assinatura;
    setPag(1); if (naUrl) gravarUrl({ [kP]: null });
  }, [assinatura, naUrl]);
  const r = recorte(total, pagina, porPagina);
  const irPara = useCallback((p: number) => { setPag(p); if (naUrl) gravarUrl({ [kP]: p > 1 ? String(p) : null }); }, [naUrl]);
  const mudarTamanho = useCallback((t: number) => { setPor(t); setPag(1); if (naUrl) gravarUrl({ [kT]: t === padrao ? null : String(t), [kP]: null }); try { localStorage.setItem(kLocal, String(t)); } catch { /* sem armazenamento */ } }, [kLocal, padrao, naUrl]);
  return { ...r, total, irPara, mudarTamanho };
}

/** barra de paginação: "1–50 de 517", páginas, anterior/próxima e tamanho da página; tudo pelo teclado */
export function Paginacao({ p, rotulo, alvo }: { p: ReturnType<typeof usePaginacao>; rotulo: string; alvo?: React.RefObject<HTMLElement | null> }) {
  const nums = useMemo(() => numerosPagina(p.pagina, p.paginas), [p.pagina, p.paginas]);
  if (p.total <= TAMANHOS[0]) return null;
  const ir = (n: number) => { p.irPara(n); const el = alvo?.current; if (el) { el.scrollIntoView({ block: "start", behavior: "auto" }); el.focus({ preventScroll: true }); } };
  return (
    <nav className="pagin" aria-label={"Paginação: " + rotulo}>
      <span className="pagin-info" aria-live="polite">{p.total ? `${(p.ini + 1).toLocaleString("pt-BR")}–${p.fim.toLocaleString("pt-BR")} de ${p.total.toLocaleString("pt-BR")}` : "0"}</span>
      {p.paginas > 1 && <span className="pagin-nums">
        <button className="btn ghost" disabled={p.pagina <= 1} onClick={() => ir(p.pagina - 1)} aria-label="Página anterior" title="Página anterior"><span aria-hidden="true">‹</span> Anterior</button>
        {nums.map((n, i) => n === "…" ? <span key={"r" + i} className="pagin-reti" aria-hidden="true">…</span>
          : <button key={n} className={"pagin-n" + (n === p.pagina ? " on" : "")} aria-current={n === p.pagina ? "page" : undefined} aria-label={`Página ${n} de ${p.paginas}`} onClick={() => ir(n)}>{n}</button>)}
        <button className="btn ghost" disabled={p.pagina >= p.paginas} onClick={() => ir(p.pagina + 1)} aria-label="Próxima página" title="Próxima página">Próxima <span aria-hidden="true">›</span></button>
      </span>}
      <label className="pagin-tam">Por página
        <select value={p.porPagina} onChange={(e) => p.mudarTamanho(Number(e.target.value))} aria-label={"Itens por página em " + rotulo}>{TAMANHOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
    </nav>
  );
}
