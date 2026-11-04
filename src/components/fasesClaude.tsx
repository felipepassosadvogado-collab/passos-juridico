"use client";
// CRM: o Claude lê o histórico de cada processo "A classificar" e sugere a fase. Nada é gravado sem a revisão:
// a pessoa confere a lista, troca a fase se quiser, desmarca o que não concorda e aplica.
import { useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { classificarFases } from "@/lib/acoesLote";
import { faseCRM } from "@/lib/regras";
import { useColunas } from "./colunasCrm";
import { nomeBonito } from "@/lib/formato";
import { Janela } from "./ui";
import { Cronometro } from "./carregando";

type Sug = { fase: string; motivo: string; confianca: "alta" | "media" | "baixa"; marcado: boolean };
const LOTE = 20;
const ROT_CONF = { alta: "certeza alta", media: "certeza média", baixa: "palpite: confira" } as const;

export function FasesComClaude({ onFechar }: { onFechar: () => void }) {
  const { sb, eu, processos, aplicar, aviso } = useDados(); const FASES = useColunas().fases;
  const semFase = useMemo(() => [...processos.values()].filter((p) => !faseCRM(p.fase) && p.fase !== "Encerrado").sort((a, b) => (a.cliente_nome || "").localeCompare(b.cliente_nome || "")), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sug, setSug] = useState<Record<string, Sug>>({}); const [prog, setProg] = useState<{ feito: number; total: number } | null>(null);
  const [erroMsg, setErroMsg] = useState(""); const [gravando, setGravando] = useState(false); const parar = useRef(false);
  const analisados = Object.keys(sug).length; const marcados = Object.entries(sug).filter(([, s]) => s.marcado);
  const analisar = async () => {
    const faltam = semFase.filter((p) => !sug[p.numero]); if (!faltam.length) return;
    parar.current = false; setErroMsg(""); setProg({ feito: 0, total: faltam.length });
    try {
      for (let i = 0; i < faltam.length && !parar.current; i += LOTE) {
        const lote = faltam.slice(i, i + LOTE);
        const r = await fetch("/api/claude/fases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numeros: lote.map((p) => p.numero) }) });
        const j = await r.text().then((t) => JSON.parse(t.trim() || "{}")).catch(() => ({ erro: "A resposta chegou incompleta. Tente de novo." }));
        if (!r.ok || j.erro) { setErroMsg(j.erro || "Não consegui analisar agora."); break; }
        const novos: Record<string, Sug> = {};
        for (const [n, s] of Object.entries(j.sugestoes || {}) as [string, Omit<Sug, "marcado">][]) novos[n] = { ...s, marcado: s.confianca !== "baixa" };
        setSug((x) => ({ ...x, ...novos })); setProg({ feito: Math.min(faltam.length, i + LOTE), total: faltam.length });
      }
    } catch (e) { setErroMsg(/fetch|network|load failed/i.test((e as Error).message) ? "A conexão caiu. Confira a internet e clique de novo: os já analisados ficam." : (e as Error).message); }
    finally { setProg(null); }
  };
  const aplicarFases = async () => {
    // confere de novo: alguém pode ter classificado enquanto o Claude analisava; esses não são tocados
    const itens = marcados.filter(([n]) => { const p = processos.get(n); return p && !faseCRM(p.fase); }).map(([numero, s]) => ({ numero, fase: s.fase, motivo: s.motivo }));
    if (!itens.length) { aviso("Nenhum processo marcado (ou todos já foram classificados)."); return; }
    setGravando(true);
    try {
      const r = await classificarFases(sb, itens, eu.id, "sugerida pelo Claude"); for (const p of r.linhas) aplicar("processos", p);
      aviso(r.erro ? `${r.linhas.length} processos classificados; os demais não foram gravados (${msgErro(r.erro)}).` : `${r.linhas.length} processos classificados. Os desmarcados continuam em “A classificar”.`);
      if (!r.erro) onFechar();
    } finally { setGravando(false); }
  };
  const marcarTodos = (v: boolean) => setSug((x) => Object.fromEntries(Object.entries(x).map(([n, s]) => [n, { ...s, marcado: v }])));
  return (
    <Janela largo onFechar={onFechar} titulo="Sugerir fases com o Claude" sub={`${semFase.length} processos em “A classificar” · os que já têm fase não são tocados`}
      acoes={<>
        {prog ? <button className="btn" onClick={() => { parar.current = true; }}>Parar</button>
          : analisados < semFase.length && <button className={"btn" + (analisados ? "" : " primary")} onClick={analisar}>{analisados ? `Analisar os outros ${semFase.length - analisados}` : `Analisar ${semFase.length} com o Claude`}</button>}
        {analisados > 0 && <button className="btn primary" disabled={gravando || !!prog || !marcados.length} onClick={aplicarFases}>{gravando ? "Gravando…" : `Aplicar ${marcados.length} ${marcados.length === 1 ? "fase" : "fases"}`}</button>}</>}>
      <p className="muted" style={{ marginTop: 0 }}>O Claude lê, de cada processo, o juízo, a classe, as últimas publicações, o histórico e as tarefas, e indica a fase atual com o motivo. <b>Nada é gravado até você clicar em “Aplicar”.</b> Confira, troque a fase se precisar e desmarque o que não concordar. Os palpites (pouco contexto) já vêm desmarcados.</p>
      {prog && <div className="banner" role="status">O Claude está analisando: {prog.feito} de {prog.total} processos <Cronometro /></div>}
      {erroMsg && <div className="banner erro" role="alert">{erroMsg}</div>}
      {!semFase.length ? <div className="empty"><strong>Nenhum processo em “A classificar”.</strong>Todos já têm fase.</div> :
        <div className="tscroll"><table className="grid"><caption className="sr-only">Fases sugeridas pelo Claude para os processos sem fase</caption>
          <thead><tr><th>{analisados > 0 && <input type="checkbox" aria-label="Marcar ou desmarcar todos" checked={marcados.length === analisados} onChange={(e) => marcarTodos(e.target.checked)} />}</th><th>Cliente · processo</th><th>Fase sugerida</th><th>Por quê</th></tr></thead>
          <tbody>{semFase.map((p) => { const s = sug[p.numero]; return (
            <tr key={p.numero} style={s && !s.marcado ? { opacity: 0.6 } : undefined}>
              <td>{s && <input type="checkbox" aria-label={"Aplicar a fase em " + nomeBonito(p.cliente_nome || p.mascara)} checked={s.marcado} onChange={(e) => setSug((x) => ({ ...x, [p.numero]: { ...s, marcado: e.target.checked } }))} />}</td>
              <td><b>{nomeBonito(p.cliente_nome || "") || "—"}</b><div className="mono muted s">{p.mascara}</div><div className="muted s">{p.orgao || ""}</div></td>
              <td>{s ? <><select aria-label={"Fase de " + nomeBonito(p.cliente_nome || p.mascara)} value={s.fase} onChange={(e) => setSug((x) => ({ ...x, [p.numero]: { ...s, fase: e.target.value, marcado: true } }))}>{[...FASES, ...(FASES.includes(s.fase) ? [] : [s.fase])].map((f) => <option key={f}>{f}</option>)}</select>
                <div className={"s " + (s.confianca === "baixa" ? "late" : "muted")}>{ROT_CONF[s.confianca]}</div></> : <span className="muted s">{prog ? "na fila…" : "—"}</span>}</td>
              <td className="s" style={{ maxWidth: 420 }}>{s?.motivo || ""}</td>
            </tr>); })}</tbody></table></div>}
    </Janela>
  );
}
