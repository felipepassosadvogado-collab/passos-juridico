"use client";
// Visualizador de documentos numa caixa flutuante: fica aberto enquanto você navega e preenche os campos.
// Arrastar pelo topo, redimensionar pelo canto, minimizar; vários documentos viram abas.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useDados } from "@/lib/dados";

type Doc = { id: string; nome: string; url: string; tipo: "pdf" | "img" | "outro"; local?: boolean };
type Ctx = { verArquivo: (f: File | Blob, nome?: string) => void; verGuardado: (caminho: string, nome: string, mime?: string | null) => void };
const C = createContext<Ctx | null>(null);
export function useVisor() { const c = useContext(C); if (!c) throw new Error("useVisor fora do provedor"); return c; }
const tipoDe = (nome: string, mime?: string | null): Doc["tipo"] => (mime === "application/pdf" || /\.pdf$/i.test(nome) ? "pdf" : /^image\//.test(mime || "") || /\.(jpe?g|png|webp|gif)$/i.test(nome) ? "img" : "outro");

export function ProvedorVisor({ children }: { children: React.ReactNode }) {
  const { sb, aviso } = useDados();
  const [docs, setDocs] = useState<Doc[]>([]); const [ativo, setAtivo] = useState<string | null>(null);
  const abrir = useCallback((d: Doc) => { setDocs((l) => [...l.filter((x) => x.id !== d.id), d].slice(-6)); setAtivo(d.id); }, []);
  const v: Ctx = {
    verArquivo: (f, nome) => { const n = nome || (f as File).name || "documento"; abrir({ id: "l:" + n + ":" + f.size, nome: n, url: URL.createObjectURL(f), tipo: tipoDe(n, f.type), local: true }); },
    verGuardado: async (caminho, nome, mime) => {
      const { data, error } = await sb.storage.from("documentos").createSignedUrl(caminho, 3600);
      if (error || !data) { aviso("Não foi possível abrir o arquivo."); return; }
      abrir({ id: "s:" + caminho, nome, url: data.signedUrl, tipo: tipoDe(nome, mime) });
    },
  };
  const fechar = (id: string) => setDocs((l) => { const d = l.find((x) => x.id === id); if (d?.local) setTimeout(() => URL.revokeObjectURL(d.url), 1000); const n = l.filter((x) => x.id !== id); if (ativo === id) setAtivo(n[n.length - 1]?.id || null); return n; });
  return <C.Provider value={v}>{children}{docs.length > 0 && <Visor docs={docs} ativo={ativo} setAtivo={setAtivo} fechar={fechar} fecharTodos={() => { docs.forEach((d) => d.local && URL.revokeObjectURL(d.url)); setDocs([]); }} />}</C.Provider>;
}

function Visor({ docs, ativo, setAtivo, fechar, fecharTodos }: { docs: Doc[]; ativo: string | null; setAtivo: (id: string) => void; fechar: (id: string) => void; fecharTodos: () => void }) {
  const [pos, setPos] = useState(() => { try { return JSON.parse(localStorage.getItem("visor.pos") || "") as { x: number; y: number; w: number; h: number }; } catch { return null; } });
  const [min, setMin] = useState(false); const [arrastando, setArrastando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null); const arr = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const p = pos || { x: 16, y: 72, w: Math.min(540, window.innerWidth - 32), h: Math.min(760, window.innerHeight - 96) };
  const guarda = (n: typeof p) => { setPos(n); try { localStorage.setItem("visor.pos", JSON.stringify(n)); } catch { /* sem armazenamento */ } };
  // guarda o tamanho quando a pessoa redimensiona pelo canto
  useEffect(() => {
    const el = caixa.current; if (!el || min) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (Math.abs(r.width - p.w) > 4 || Math.abs(r.height - p.h) > 4) guarda({ ...p, w: Math.round(r.width), h: Math.round(r.height) }); });
    ro.observe(el); return () => ro.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // com o visualizador aberto, as caixas do sistema vão para a direita, para os dois ficarem lado a lado
  useEffect(() => { document.body.classList.toggle("com-visor", !min); return () => document.body.classList.remove("com-visor"); }, [min]);
  // as caixas começam depois da borda direita do visualizador, para ele não tampar os botões
  useEffect(() => { document.body.style.setProperty("--visor-dir", Math.max(24, Math.round(p.x + p.w + 16)) + "px"); return () => { document.body.style.removeProperty("--visor-dir"); }; }, [p.x, p.w]);
  const d = docs.find((x) => x.id === ativo) || docs[docs.length - 1];
  const limita = (x: number, y: number) => ({ x: Math.min(Math.max(x, 8 - p.w + 120), window.innerWidth - 120), y: Math.min(Math.max(y, 8), window.innerHeight - 48) });
  return (
    <div ref={caixa} className={"visor" + (min ? " min" : "") + (arrastando ? " arrastando" : "")} role="dialog" aria-label="Visualizar documento"
      style={{ left: p.x, top: p.y, width: min ? 300 : p.w, height: min ? undefined : p.h }}>
      <div className="visor-topo"
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); arr.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; setArrastando(true); }}
        onPointerMove={(e) => { const a = arr.current; if (a) setPos({ ...p, ...limita(a.px + e.clientX - a.x, a.py + e.clientY - a.y) }); }}
        onPointerUp={() => { if (arr.current) { arr.current = null; setArrastando(false); guarda(p); } }}>
        <span className="visor-ic" aria-hidden="true">👁</span>
        <div className="visor-abas">{docs.map((x) => <span key={x.id} className={"visor-aba" + (x.id === d?.id ? " on" : "")}>
          <button className="visor-aba-n" title={x.nome} onClick={() => { setAtivo(x.id); setMin(false); }}>{x.nome}</button>
          <button className="visor-aba-x" aria-label={"Fechar " + x.nome} onClick={() => fechar(x.id)}>✕</button></span>)}</div>
        {d && <a className="icb" href={d.url} target="_blank" rel="noopener noreferrer" title="Abrir numa aba nova" aria-label="Abrir numa aba nova">↗</a>}
        <button className="icb" title={min ? "Expandir" : "Minimizar"} aria-label={min ? "Expandir" : "Minimizar"} onClick={() => setMin(!min)}>{min ? "▢" : "–"}</button>
        <button className="icb" title="Fechar tudo" aria-label="Fechar o visualizador" onClick={fecharTodos}>✕</button>
      </div>
      {!min && d && <div className="visor-corpo">
        {d.tipo === "pdf" ? <iframe key={d.id} src={d.url + (d.local ? "" : "#view=FitH")} title={d.nome} />
          : d.tipo === "img" ? <div className="visor-img"><img src={d.url} alt={d.nome} /></div>
            : <div className="empty">Esse tipo de arquivo não tem pré-visualização. <a className="reflink" href={d.url} target="_blank" rel="noopener noreferrer" download={d.nome}>Baixar {d.nome}</a></div>}
      </div>}
    </div>
  );
}
