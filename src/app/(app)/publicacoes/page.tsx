"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Paginacao, useFiltroUrl, usePaginacao } from "@/components/paginacao";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { atoPub, prazoDaPublicacao, precisaAvisar } from "@/lib/regras";
import { dataValida, diferencaDias, hojeBR, situacaoPrazo } from "@/lib/prazos";
import type { Analise, Aviso, Tarefa } from "@/lib/tipos";
import { useJanelas } from "@/components/janelas";
import { useAnalisar } from "@/components/publicacoes";
import { BotaoDjen } from "@/components/djen";
import { RepetidasTiradas } from "@/components/repetidas";
import { Ic } from "@/components/ui";

function Caixa() {
  const { caixa, processos, tarefas, avisos, v } = useDados(); const j = useJanelas(); const { analisar, ocupado } = useAnalisar();
  const sp = useSearchParams();
  useEffect(() => { const a = Number(sp.get("abrir")); if (a && caixa.has(a)) j.abrirPub(a); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filtroUrl, setFiltroUrl] = useFiltroUrl("filtro"); const filtro = (["vencidos", "hoje", "semana", "sem"].includes(filtroUrl) ? filtroUrl : "") as "" | "vencidos" | "hoje" | "semana" | "sem"; const setFiltro = setFiltroUrl;
  const topo = useRef<HTMLDivElement>(null);
  const hoje = hojeBR();
  // índices por publicação (antes, cada linha percorria todas as tarefas e todos os avisos do escritório)
  const { tarPorPub, avPorPub } = useMemo(() => {
    const tarPorPub = new Map<number, Tarefa[]>(); for (const t of tarefas.values()) if (t.publicacao_id != null) (tarPorPub.get(t.publicacao_id) || tarPorPub.set(t.publicacao_id, []).get(t.publicacao_id)!).push(t);
    const avPorPub = new Map<number, Aviso>(); for (const a of avisos.values()) if (a.publicacao_id != null && !avPorPub.has(a.publicacao_id)) avPorPub.set(a.publicacao_id, a);
    return { tarPorPub, avPorPub };
  }, [tarefas, avisos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  // cada publicação com o seu prazo (da tarefa criada, ou calculado pela análise do Claude)
  const todos = [...caixa.values()].map((c) => {
    const ts = tarPorPub.get(c.id) || [];
    const pr = prazoDaPublicacao(c, ts); const k = pr.venc && dataValida(pr.venc) ? diferencaDias(pr.venc, hoje) : null;
    return { c, ts, pr, k, grupo: k == null ? 3 : k < 0 ? 0 : k === 0 ? 1 : 2 };
  });
  const cont = { vencidos: todos.filter((x) => x.grupo === 0).length, hoje: todos.filter((x) => x.grupo === 1).length,
    semana: todos.filter((x) => x.k != null && x.k > 0 && x.k <= 5).length, sem: todos.filter((x) => !x.c.analise).length };
  // vencidos primeiro (os mais atrasados no topo), depois os de hoje, depois os demais pela data da publicação
  const lista = todos.filter((x) => !filtro || (filtro === "vencidos" ? x.grupo === 0 : filtro === "hoje" ? x.grupo === 1 : filtro === "semana" ? x.k != null && x.k > 0 && x.k <= 5 : !x.c.analise))
    .sort((a, b) => a.grupo - b.grupo || (a.grupo <= 1 ? (a.pr.venc || "").localeCompare(b.pr.venc || "") : 0) || a.c.data.localeCompare(b.c.data) || a.c.id - b.c.id);
  const pg = usePaginacao("publicacoes", lista.length, filtro);
  const itens = lista.map((x) => x.c);
  const sem = itens.filter((c) => !c.analise);
  const [prog, setProg] = useState<{ feito: number; total: number } | null>(null);
  // sem análise primeiro; se todas já têm, reanalisa (útil depois de mudar algo no processo)
  const alvo = sem.length ? sem : itens; const re = !sem.length;
  const analisarTodas = async (l: typeof itens) => {
    setProg({ feito: 0, total: l.length });
    try { for (let i = 0; i < l.length; i += 10) { const r = await analisar(l.slice(i, i + 10)); if (!r) break; setProg({ feito: Math.min(l.length, i + 10), total: l.length }); } }
    finally { setProg(null); }
  };
  return (
    <>
      <div className="head"><div><h2>Publicações</h2><div className="sub">{todos.length ? `${todos.length} para triar · prazos vencidos primeiro, depois as mais antigas` : "Nenhuma publicação pendente"}</div></div>
        <div className="tools"><BotaoDjen />
          {itens.length > 0 && <>
            <button className="btn" disabled={ocupado.size > 0} title={re ? "Todas já têm análise: analisa de novo as 10 primeiras da lista" : "Analisa as próximas 10 sem análise"} onClick={() => analisar(alvo.slice(0, 10))}>{Ic.claude}{ocupado.size && !prog ? "Analisando…" : `${re ? "Reanalisar" : "Analisar"} ${Math.min(alvo.length, 10)} com Claude`}</button>
            <button className="btn" disabled={ocupado.size > 0} title={re ? "Analisa de novo todas as publicações da lista" : "Analisa todas as que ainda não têm análise, de 10 em 10"} onClick={() => analisarTodas(alvo)}>{Ic.claude}{prog ? `Analisando ${prog.feito} de ${prog.total}…` : `${re ? "Reanalisar" : "Analisar"} todas (${alvo.length})`}</button>
          </>}</div></div>
      <RepetidasTiradas />
      {todos.length > 0 && <div className="pub-res">
        {([["", "Todas", todos.length, ""], ["vencidos", "Prazo vencido", cont.vencidos, "late"], ["hoje", "Vence hoje", cont.hoje, "late"], ["semana", "Vence em até 5 dias", cont.semana, "soon"], ["sem", "Sem análise", cont.sem, ""]] as const)
          .map(([k, rot, n, cor]) => (k === "" || n > 0) && <button key={k} className={"pub-chip " + cor + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}><b>{n}</b>{rot}</button>)}
      </div>}
      {!todos.length ? <div className="panel"><div className="empty"><strong>Tudo triado.</strong>A busca no DJEN pela OAB/SC 58.547 e pelo seu nome roda sozinha às 7h, 10h, 13h, 16h e 19h dos dias úteis (e no fim de semana) e coloca aqui cada publicação nova. Para cada uma, crie as tarefas e conclua a análise.</div></div> :
        <><div className="panel tscroll" ref={topo} tabIndex={-1} aria-label="Publicações para triar"><table className="grid pubs"><caption className="sr-only">Publicações para triar, prazos vencidos primeiro{pg.paginas > 1 ? `, página ${pg.pagina} de ${pg.paginas}` : ""}. Enter abre a publicação.</caption><thead><tr><th>Data</th><th>Prazo</th><th>Cliente</th><th>Ato</th><th>Juízo · processo</th><th /></tr></thead>
          <tbody>{lista.slice(pg.ini, pg.fim).map(({ c, ts, pr, grupo }, j0) => { const i = pg.ini + j0;
            const p = processos.get(c.processo_numero); const a = c.analise as Analise | null;
            const nt = ts.length; const av = avPorPub.get(c.id);
            const sp = situacaoPrazo(pr.venc, hoje);
            const sec = !filtro && (j0 === 0 || lista[i - 1].grupo !== grupo) ? ["Prazo vencido, sem andamento", "Vencem hoje", "Com prazo", "Sem prazo calculado (analise com o Claude ou crie a tarefa)"][grupo] : null;
            return [sec && <tr key={"s" + grupo} className={"pub-sec" + (grupo <= 1 ? " late" : "")}><td colSpan={6}>{sec}</td></tr>,
              <tr key={c.id} className={"click" + (grupo === 0 ? " atras" : grupo === 1 ? " hoje" : "")} tabIndex={0} onClick={() => j.abrirPub(c.id)} onKeyDown={(e) => { if (e.key === "Enter") j.abrirPub(c.id); }}>
                <td className="num">{dataBR(c.data).slice(0, 5)}</td>
                <td className="prazo">{pr.venc ? <><div className="mono">{dataBR(pr.venc)}</div><span className={"pill " + sp.cor}>{sp.texto}</span>{pr.origem === "analise" && <div className="s" title="Calculado pela análise do Claude; crie a tarefa para fixar">estimado</div>}</> : <span className="muted s">—</span>}</td>
                <td><div className="pc">{nomeBonito(p?.cliente_nome || "—")}</div><div className="s">x {bancoCurto(p?.banco)}</div></td>
                <td><div>{atoPub(c)}</div>{a && <div className="s ai-1">Claude: {[a.tarefa || a.ato, a.prazoDias ? a.prazoDias + " dias úteis" : ""].filter(Boolean).join(" · ")}</div>}</td>
                <td><div className="s">{c.orgao || ""}</div><div className="s mono">{p?.mascara || c.processo_numero}</div></td>
                <td className="tags">{nt > 0 && <span className="pill acc">{nt} {nt === 1 ? "tarefa" : "tarefas"}</span>}
                  {av ? <span className={"pill " + (av.status === "pendente" ? "soon" : "ok")}>{av.status === "avisado" ? "mensagem enviada" : av.status === "dispensado" ? "sem aviso" : "avisar cliente"}</span> : precisaAvisar(c) ? <span className="pill soon">avisar cliente?</span> : null}
                  {c.eproc && <span className="pill">eproc</span>}{ocupado.has(c.id) && <span className="pill acc">analisando</span>}</td>
              </tr>];
          })}</tbody></table></div><Paginacao p={pg} rotulo="publicações" alvo={topo} /></>}
    </>
  );
}
export default function Pagina() { return <Suspense><Caixa /></Suspense>; }
