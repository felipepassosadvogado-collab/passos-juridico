"use client";
// Caixinhas de seleção no visual do sistema: todo <select> do site abre esta lista em vez do menu do
// sistema operacional. O <select> continua sendo o dono do valor (o React segue recebendo o onChange),
// então nenhuma tela precisou mudar. Em celular/tablet fica o menu nativo, que é melhor para o toque.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Op = { value: string; label: string; disabled: boolean; grupo?: string };
type Aberto = { sel: HTMLSelectElement; ops: Op[]; atual: number; x: number; y: number; w: number; acima: boolean; maxH: number };

const setValor = { call: (el: HTMLSelectElement, v: string) => Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, v) };
const toque = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function lerOpcoes(sel: HTMLSelectElement): Op[] {
  return [...sel.options].map((o) => ({ value: o.value, label: o.label || o.text, disabled: o.disabled, grupo: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined }));
}

export function SeletorGlobal() {
  const [ab, setAb] = useState<Aberto | null>(null);
  const [foco, setFoco] = useState(0);
  const lista = useRef<HTMLDivElement>(null); const focoRef = useRef(0); focoRef.current = foco;
  const busca = useRef({ txt: "", t: 0 });

  const abrir = useCallback((sel: HTMLSelectElement) => {
    if (sel.disabled || sel.multiple || sel.size > 1) return;
    const ops = lerOpcoes(sel); if (!ops.length) return;
    const r = sel.getBoundingClientRect(); const vh = window.innerHeight, vw = window.innerWidth;
    const embaixo = vh - r.bottom - 12, emcima = r.top - 12; const precisa = Math.min(ops.length * 38 + 12, 360);
    const acima = embaixo < Math.min(precisa, 220) && emcima > embaixo;
    const w = Math.min(Math.max(r.width, 200), vw - 16); const x = Math.min(Math.max(8, r.left), vw - w - 8);
    const atual = Math.max(0, sel.selectedIndex);
    setAb({ sel, ops, atual, x, y: acima ? r.top - 6 : r.bottom + 6, w, acima, maxH: Math.max(160, Math.min(360, acima ? emcima : embaixo)) });
    setFoco(atual);
  }, []);
  const fechar = useCallback((devolverFoco = true) => { setAb((a) => { if (a && devolverFoco) a.sel.focus({ preventScroll: true }); return null; }); }, []);
  const escolher = useCallback((i: number) => {
    setAb((a) => {
      if (!a) return null; const o = a.ops[i]; if (!o || o.disabled) return a;
      if (a.sel.value !== o.value) { setValor.call(a.sel, o.value); a.sel.dispatchEvent(new Event("input", { bubbles: true })); a.sel.dispatchEvent(new Event("change", { bubbles: true })); }
      a.sel.focus({ preventScroll: true }); return null;
    });
  }, []);

  // intercepta o clique e as teclas que abririam o menu nativo
  useEffect(() => {
    if (toque()) return;
    const down = (e: MouseEvent) => {
      const s = (e.target as HTMLElement | null)?.closest?.("select") as HTMLSelectElement | null;
      if (!s || e.button !== 0 || s.multiple || s.size > 1 || s.dataset.nativo != null) return;
      e.preventDefault(); s.focus({ preventScroll: true });
      if (ab && ab.sel === s) setAb(null); else abrir(s);
    };
    const tecla = (e: KeyboardEvent) => {
      const s = e.target as HTMLElement; if (ab || !(s instanceof HTMLSelectElement) || s.multiple || s.dataset.nativo != null) return;
      if ([" ", "Enter"].includes(e.key) || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) { e.preventDefault(); abrir(s); }
    };
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", tecla, true); };
  }, [abrir, ab]);

  // fecha ao clicar fora, rolar a página ou redimensionar
  useEffect(() => {
    if (!ab) return;
    const fora = (e: MouseEvent) => { const t = e.target as Node; if (lista.current?.contains(t) || (t as HTMLElement).closest?.("select")) return; fechar(false); };
    const rolar = (e: Event) => { if (lista.current?.contains(e.target as Node)) return; fechar(false); };
    const tam = () => fechar(false);
    document.addEventListener("mousedown", fora, true); window.addEventListener("scroll", rolar, true); window.addEventListener("resize", tam);
    return () => { document.removeEventListener("mousedown", fora, true); window.removeEventListener("scroll", rolar, true); window.removeEventListener("resize", tam); };
  }, [ab, fechar]);

  // teclado dentro da lista
  useEffect(() => {
    if (!ab) return;
    const mover = (de: number, passo: number) => { let i = de; for (let n = 0; n < ab.ops.length; n++) { i = Math.min(ab.ops.length - 1, Math.max(0, i + passo)); if (!ab.ops[i].disabled) return i; if (i === 0 || i === ab.ops.length - 1) break; } return de; };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } fechar(e.key === "Escape"); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setFoco((f) => mover(f, 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setFoco((f) => mover(f, -1)); }
      else if (e.key === "Home") { e.preventDefault(); setFoco(mover(-1, 1)); }
      else if (e.key === "End") { e.preventDefault(); setFoco(mover(ab.ops.length, -1)); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); escolher(focoRef.current); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        const b = busca.current; const agora = Date.now(); b.txt = (agora - b.t < 700 ? b.txt : "") + e.key.toLowerCase(); b.t = agora;
        const sa = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const i = ab.ops.findIndex((o) => !o.disabled && sa(o.label).startsWith(sa(b.txt))); if (i >= 0) setFoco(i);
      }
    };
    document.addEventListener("keydown", k, true); return () => document.removeEventListener("keydown", k, true);
  }, [ab, fechar, escolher]);

  useEffect(() => { lista.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: "nearest" }); }, [foco, ab]);

  if (!ab) return null;
  let grupo: string | undefined;
  return createPortal(
    <div ref={lista} className={"sel-pop" + (ab.acima ? " acima" : "")} role="listbox" aria-label={ab.sel.getAttribute("aria-label") || "Opções"}
      style={{ left: ab.x, top: ab.acima ? undefined : ab.y, bottom: ab.acima ? window.innerHeight - ab.y : undefined, minWidth: ab.w, maxHeight: ab.maxH }}>
      {ab.ops.map((o, i) => {
        const cab = o.grupo && o.grupo !== grupo ? <div key={"g" + i} className="sel-grupo">{o.grupo}</div> : null; grupo = o.grupo;
        return [cab, <div key={i} data-i={i} role="option" aria-selected={i === ab.atual} aria-disabled={o.disabled || undefined}
          className={"sel-op" + (i === ab.atual ? " sel" : "") + (i === foco ? " foco" : "") + (o.disabled ? " off" : "") + (o.value === "" ? " vazio" : "")}
          onMouseEnter={() => !o.disabled && setFoco(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(i)}>
          <span className="sel-ck" aria-hidden="true">{i === ab.atual ? "✓" : ""}</span><span className="sel-tx">{o.label}</span></div>];
      })}
    </div>, document.body);
}
