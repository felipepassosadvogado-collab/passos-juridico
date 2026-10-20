"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import { atoPub, precisaAvisar } from "@/lib/regras";
import type { Analise } from "@/lib/tipos";
import { useJanelas } from "@/components/janelas";
import { useAnalisar } from "@/components/publicacoes";
import { BotaoDjen } from "@/components/djen";
import { Ic } from "@/components/ui";

function Caixa() {
  const { caixa, processos, tarefas, avisos, config } = useDados(); const j = useJanelas(); const { analisar, ocupado } = useAnalisar();
  const sp = useSearchParams();
  useEffect(() => { const a = Number(sp.get("abrir")); if (a && caixa.has(a)) j.abrirPub(a); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const itens = [...caixa.values()].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  const sem = itens.filter((c) => !c.analise);
  const erroDjen = config.djen?.ultimoErro as string | undefined;
  return (
    <>
      <div className="head"><div><h2>Publicações</h2><div className="sub">{itens.length ? itens.length + " para triar, mais antigas primeiro" : "Nenhuma publicação pendente"}</div></div>
        <div className="tools"><BotaoDjen />
          {sem.length > 0 && <button className="btn" disabled={ocupado.size > 0} onClick={() => analisar(sem.slice(0, 10))}>{Ic.claude}{ocupado.size ? "Analisando…" : `Analisar ${Math.min(sem.length, 10)} com Claude`}</button>}</div></div>
      {erroDjen && <div className="banner erro">A última busca automática no DJEN falhou ({erroDjen}). Clique em “Buscar no DJEN” para tentar de novo.</div>}
      {!itens.length ? <div className="panel"><div className="empty"><strong>Tudo triado.</strong>A busca no DJEN pela OAB/SC 58.547 roda sozinha às 7h, 12h e 17h dos dias úteis e coloca aqui cada publicação nova. Para cada uma, crie as tarefas e conclua a análise.</div></div> :
        <div className="panel tscroll"><table className="grid pubs"><thead><tr><th>Data</th><th>Cliente</th><th>Ato</th><th>Juízo · processo</th><th /></tr></thead>
          <tbody>{itens.map((c) => {
            const p = processos.get(c.processo_numero); const a = c.analise as Analise | null;
            const nt = [...tarefas.values()].filter((t) => t.publicacao_id === c.id).length; const av = [...avisos.values()].find((x) => x.publicacao_id === c.id);
            return (
              <tr key={c.id} className="click" tabIndex={0} onClick={() => j.abrirPub(c.id)} onKeyDown={(e) => { if (e.key === "Enter") j.abrirPub(c.id); }}>
                <td className="num">{dataBR(c.data).slice(0, 5)}</td>
                <td><div className="pc">{nomeBonito(p?.cliente_nome || "—")}</div><div className="s">x {bancoCurto(p?.banco)}</div></td>
                <td><div>{atoPub(c)}</div>{a && <div className="s ai-1">Claude: {[a.tarefa || a.ato, a.prazoDias ? a.prazoDias + " dias úteis" : ""].filter(Boolean).join(" · ")}</div>}</td>
                <td><div className="s">{c.orgao || ""}</div><div className="s mono">{p?.mascara || c.processo_numero}</div></td>
                <td className="tags">{nt > 0 && <span className="pill acc">{nt} {nt === 1 ? "tarefa" : "tarefas"}</span>}
                  {av ? <span className={"pill " + (av.status === "avisado" ? "ok" : "soon")}>{av.status === "avisado" ? "cliente avisado" : "avisar cliente"}</span> : precisaAvisar(c) ? <span className="pill soon">avisar cliente?</span> : null}
                  {c.eproc && <span className="pill">eproc</span>}{ocupado.has(c.id) && <span className="pill acc">analisando</span>}</td>
              </tr>);
          })}</tbody></table></div>}
    </>
  );
}
export default function Pagina() { return <Suspense><Caixa /></Suspense>; }
