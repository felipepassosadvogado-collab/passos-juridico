"use client";
// Depois de gerar uma peça em Word: abre uma caixa avisando que os trechos entre [colchetes] são pontos que o Claude
// não encontrou nos documentos ou que precisam da confirmação de quem vai protocolar — e lista quais são.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { temTutela } from "@/lib/tutela";
export { temTutela };

type Achado = { trecho: string; antes: string; depois: string };
type Pedido = { nome: string; achados: Achado[] | null; intermediaria?: boolean; tipo?: string; tutela?: boolean | null };

const EVENTO = "passos:colchetes";

/** lê o texto do .docx e devolve cada trecho entre colchetes com um pedaço da frase em volta */
export async function colchetesDoDocx(arquivo: Blob): Promise<Achado[]> { return (await lerPeca(arquivo)).achados; }
async function lerPeca(arquivo: Blob): Promise<{ achados: Achado[]; tutela: boolean }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arquivo);
  const xml = await zip.file("word/document.xml")?.async("string"); if (!xml) return { achados: [], tutela: false };
  const texto = xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const out: Achado[] = []; const vistos = new Set<string>();
  for (const par of texto.split("\n")) for (const m of par.matchAll(/\[([^[\]\n]{1,200})\]/g)) {
    const trecho = m[0]; if (/^\[(sic|…|\.\.\.)\]$/i.test(trecho)) continue;
    const i = m.index || 0; const antes = par.slice(Math.max(0, i - 60), i), depois = par.slice(i + trecho.length, i + trecho.length + 40);
    const k = trecho + "|" + antes.slice(-20); if (vistos.has(k)) continue; vistos.add(k);
    out.push({ trecho, antes: (i > 60 ? "…" : "") + antes, depois: depois + (par.length > i + trecho.length + 40 ? "…" : "") });
  }
  return { achados: out, tutela: temTutela(texto) };
}

/** chame logo depois de baixar a peça: a caixa abre e lista os colchetes encontrados */
export function avisarColchetes(arquivo: Blob, nome: string, op: { intermediaria?: boolean; tipo?: string } = {}) {
  if (typeof window === "undefined") return;
  const manda = (d: Partial<Pedido>) => window.dispatchEvent(new CustomEvent<Pedido>(EVENTO, { detail: { nome, achados: null, tutela: null, ...op, ...d } }));
  manda({});
  lerPeca(arquivo).then((r) => manda(r)).catch(() => manda({ achados: [], tutela: null }));
}

/** a caixa em si (fica montada uma vez na tela principal) */
export function CaixaColchetes() {
  const [p, setP] = useState<Pedido | null>(null); const ok = useRef<HTMLButtonElement>(null); const [analisou, setAnalisou] = useState(false);
  // petição intermediária: só fecha depois de marcar que analisou a tutela de urgência
  const travada = !!p?.intermediaria && !analisou;
  const fechar = () => { if (!travada) { setP(null); setAnalisou(false); } };
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent<Pedido>).detail; setP((x) => { if (!x || x.nome !== d.nome) setAnalisou(false); return d; }); }; window.addEventListener(EVENTO, f); return () => window.removeEventListener(EVENTO, f); }, []);
  useEffect(() => { if (!p) return; ok.current?.focus(); // fase de captura na janela: o Esc fecha só esta caixa, não a janela da peça que está atrás
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fechar(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [p, travada]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const n = p.achados?.length ?? 0;
  return createPortal(
    <div className="colch-fundo" onClick={fechar}>
      <div className="colch" role="dialog" aria-modal="true" aria-labelledby="colch-tit" onClick={(e) => e.stopPropagation()}>
        {p.intermediaria && <div className="colch-tutela" role="alert">
          <div className="colch-tutela-tit"><span aria-hidden="true">🚨</span> ATENÇÃO: ANALISE A TUTELA DE URGÊNCIA ANTES DE PROTOCOLAR</div>
          <p><b>É obrigatório verificar se cabe pedido de tutela de urgência (art. 300 do CPC) nesta peça.</b> Não protocole sem essa análise.</p>
          {/laudo|per[ií]cia/i.test(p.tipo || "") && <p><b>MANIFESTAÇÃO AO LAUDO:</b> se o laudo concluiu que a assinatura <b>não é do cliente</b>, este é o momento mais forte do processo para pedir a <b>SUSPENSÃO IMEDIATA DOS DESCONTOS</b> no benefício. A probabilidade do direito agora está provada por perito do juízo, e o desconto mensal sobre verba alimentar é o perigo de dano.</p>}
          <div className={"colch-tutela-st " + (p.tutela === null ? "" : p.tutela ? "tem" : "falta")} role="status">
            {p.tutela === null ? "Verificando se a peça já pede tutela…" : p.tutela
              ? <>✓ Esta peça <b>menciona tutela de urgência / liminar</b>. Confira se o pedido está no capítulo dos pedidos, com os requisitos e o que deve ser suspenso.</>
              : <>✗ Esta peça <b>NÃO contém pedido de tutela de urgência</b>. Avalie agora se deve incluir antes de protocolar.</>}
          </div>
          <label className="colch-tutela-chk"><input type="checkbox" checked={analisou} onChange={(e) => setAnalisou(e.target.checked)} /> Analisei se cabe tutela de urgência nesta peça</label>
        </div>}
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
          <button ref={ok} className="btn primary" disabled={travada} title={travada ? "Marque antes que analisou a tutela de urgência" : undefined} onClick={fechar}>{travada ? "Marque a análise da tutela para fechar" : "Entendi, vou revisar"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
