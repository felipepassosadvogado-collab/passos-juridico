"use client";
// Depois de gerar uma peça em Word: abre uma caixa avisando que os trechos entre [colchetes] são pontos que o Claude
// não encontrou nos documentos ou que precisam da confirmação de quem vai protocolar — e lista quais são.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Achado = { trecho: string; antes: string; depois: string };
type Pedido = { nome: string; achados: Achado[] | null };
const EVENTO = "passos:colchetes";

/** lê o texto do .docx e devolve cada trecho entre colchetes com um pedaço da frase em volta */
export async function colchetesDoDocx(arquivo: Blob): Promise<Achado[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arquivo);
  const xml = await zip.file("word/document.xml")?.async("string"); if (!xml) return [];
  const texto = xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const out: Achado[] = []; const vistos = new Set<string>();
  for (const par of texto.split("\n")) for (const m of par.matchAll(/\[([^[\]\n]{1,200})\]/g)) {
    const trecho = m[0]; if (/^\[(sic|…|\.\.\.)\]$/i.test(trecho)) continue;
    const i = m.index || 0; const antes = par.slice(Math.max(0, i - 60), i), depois = par.slice(i + trecho.length, i + trecho.length + 40);
    const k = trecho + "|" + antes.slice(-20); if (vistos.has(k)) continue; vistos.add(k);
    out.push({ trecho, antes: (i > 60 ? "…" : "") + antes, depois: depois + (par.length > i + trecho.length + 40 ? "…" : "") });
  }
  return out;
}

/** chame logo depois de baixar a peça: a caixa abre e lista os colchetes encontrados */
export function avisarColchetes(arquivo: Blob, nome: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Pedido>(EVENTO, { detail: { nome, achados: null } }));
  colchetesDoDocx(arquivo).then((achados) => window.dispatchEvent(new CustomEvent<Pedido>(EVENTO, { detail: { nome, achados } })))
    .catch(() => window.dispatchEvent(new CustomEvent<Pedido>(EVENTO, { detail: { nome, achados: [] } })));
}

/** a caixa em si (fica montada uma vez na tela principal) */
export function CaixaColchetes() {
  const [p, setP] = useState<Pedido | null>(null); const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { const f = (e: Event) => setP((e as CustomEvent<Pedido>).detail); window.addEventListener(EVENTO, f); return () => window.removeEventListener(EVENTO, f); }, []);
  useEffect(() => { if (!p) return; ok.current?.focus(); // fase de captura na janela: o Esc fecha só esta caixa, não a janela da peça que está atrás
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setP(null); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [p]);
  if (!p) return null;
  const n = p.achados?.length ?? 0;
  return createPortal(
    <div className="colch-fundo" onClick={() => setP(null)}>
      <div className="colch" role="dialog" aria-modal="true" aria-labelledby="colch-tit" onClick={(e) => e.stopPropagation()}>
        <h3 id="colch-tit"><span aria-hidden="true">⚠</span> Revise os trechos entre [colchetes] antes de protocolar</h3>
        <p>O Claude coloca entre <b>[colchetes]</b> o que <b>não encontrou nos documentos</b> ou o que <b>precisa da sua confirmação</b>, como <i>[nº do evento]</i>, <i>[data do laudo]</i> ou <i>[confirmar o valor]</i>. Eles são avisos para você, não fazem parte do texto final.</p>
        <ol className="colch-passos">
          <li>Abra <b>{p.nome}</b> no Word.</li>
          <li>Procure por <kbd>[</kbd> com <kbd>Ctrl</kbd>+<kbd>F</kbd> (no Mac, <kbd>⌘</kbd>+<kbd>F</kbd>).</li>
          <li>Em cada um, confira, complete ou corrija o texto e <b>apague os colchetes</b>.</li>
        </ol>
        {p.achados === null ? <div className="muted" role="status">Procurando colchetes na peça…</div>
          : n ? <>
            <div className="colch-n" role="status"><b>{n}</b> {n === 1 ? "trecho entre colchetes nesta peça" : "trechos entre colchetes nesta peça"}:</div>
            <ul className="colch-lista">{p.achados.slice(0, 20).map((a, i) => <li key={i}><span className="muted">{a.antes}</span><mark>{a.trecho}</mark><span className="muted">{a.depois}</span></li>)}</ul>
            {n > 20 && <div className="muted s">e mais {n - 20}.</div>}
          </> : <div className="colch-n ok" role="status">Não encontrei trechos entre colchetes nesta peça. Mesmo assim, leia com atenção antes de protocolar.</div>}
        <div className="tools" style={{ justifyContent: "flex-end" }}>
          {n > 0 && <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(p.achados!.map((a) => "• " + a.trecho + " — " + a.antes + a.trecho + a.depois).join("\n")); } catch { /* sem área de transferência */ } }}>Copiar a lista</button>}
          <button ref={ok} className="btn primary" onClick={() => setP(null)}>Entendi, vou revisar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
