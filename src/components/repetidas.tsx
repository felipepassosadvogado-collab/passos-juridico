"use client";
// Conferência das publicações que a busca do DJEN tirou da caixa por serem o mesmo ato de outra:
// mostra lado a lado a que saiu e a que ficou, e devolve à caixa com um clique (e a busca não tira de novo).
import { useEffect, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, nomeBonito } from "@/lib/formato";

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = { id: number; processo_numero: string; data: string; tipo_doc: string | null; orgao: string | null; texto: string | null; analise: any; triagem: string };
const inicio = (t: string | null) => { const s = (t || "").replace(/\s+/g, " ").trim(); return s.length > 260 ? s.slice(0, 260) + "…" : s || "(sem texto)"; };

export function RepetidasTiradas() {
  const { sb, processos, aviso, recarregar } = useDados();
  const [lista, setLista] = useState<{ tirada: P; ficou: P | null }[] | null>(null); const [aberto, setAberto] = useState(false); const [ocup, setOcup] = useState<number | null>(null);
  const carregar = async () => {
    const { data, error } = await sb.from("publicacoes").select("id,processo_numero,data,tipo_doc,orgao,texto,analise,triagem").not("analise->repetidaDe", "is", null).order("data", { ascending: false }).limit(300);
    if (error) { setLista([]); return; }
    const tiradas = (data || []) as P[]; const ids = [...new Set(tiradas.map((t) => +t.analise.repetidaDe))];
    const ficou = new Map<number, P>();
    if (ids.length) { const r = await sb.from("publicacoes").select("id,processo_numero,data,tipo_doc,orgao,texto,analise,triagem").in("id", ids); for (const p of (r.data || []) as P[]) ficou.set(+p.id, p); }
    setLista(tiradas.map((t) => ({ tirada: t, ficou: ficou.get(+t.analise.repetidaDe) || null })));
  };
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista?.length) return null;
  const devolver = async (t: P) => {
    setOcup(t.id);
    // guarda que esta não é repetida (a busca do DJEN respeita) e tira a marca da análise
    const { data: cfg } = await sb.from("config").select("valor").eq("chave", "repetidas").maybeSingle();
    const nao = [...new Set([...((cfg?.valor?.naoRepetidas as number[]) || []), t.id])].slice(-2000);
    const c = await sb.from("config").upsert({ chave: "repetidas", valor: { naoRepetidas: nao } }, { onConflict: "chave" });
    if (c.error) { setOcup(null); aviso("Só o titular pode devolver publicações à caixa. " + msgErro(c.error)); return; }
    const { repetidaDe: _r, ...resto } = t.analise || {}; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (String(resto.resumo || "").startsWith("Publicação repetida no DJEN")) delete resto.resumo;
    const { error } = await sb.from("publicacoes").update({ triagem: "pendente", concluida_em: null, concluida_por: null, analise: Object.keys(resto).length ? resto : null }).eq("id", t.id);
    setOcup(null);
    if (error) { aviso(msgErro(error)); return; }
    aviso("Publicação devolvida à caixa. A busca do DJEN não vai tirá-la de novo."); await recarregar(); carregar();
  };
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <button className="reflink" style={{ padding: "12px 16px", width: "100%", textAlign: "left" }} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        {aberto ? "▾" : "▸"} {lista.length} {lista.length === 1 ? "publicação tirada da caixa por ser repetida" : "publicações tiradas da caixa por serem repetidas"} (mesmo ato ou outra parte do mesmo julgamento) — conferir
      </button>
      {aberto && <div className="tscroll"><table className="grid"><caption className="sr-only">Publicações tiradas como repetidas e a publicação que ficou na caixa</caption>
        <thead><tr><th>Processo</th><th>Saiu da caixa</th><th>Ficou (é desta a tarefa/análise)</th><th /></tr></thead>
        <tbody>{lista.map(({ tirada: t, ficou: f }) => { const p = processos.get(t.processo_numero); return (
          <tr key={t.id}>
            <td><b>{nomeBonito(p?.cliente_nome || "")}</b><div className="mono muted s">{p?.mascara || t.processo_numero}</div></td>
            <td style={{ maxWidth: 380 }}><div className="s"><b>{dataBR(t.data)} · {t.tipo_doc || "—"}</b> · nº {t.id}</div><div className="muted s">{inicio(t.texto)}</div></td>
            <td style={{ maxWidth: 380 }}>{f ? <><div className="s"><b>{dataBR(f.data)} · {f.tipo_doc || "—"}</b> · nº {f.id} · {f.triagem === "pendente" ? "na caixa" : "já tratada"}</div><div className="muted s">{inicio(f.texto)}</div></> : <span className="muted s">não encontrada</span>}</td>
            <td><button className="btn ghost" disabled={ocup === t.id} onClick={() => devolver(t)}>{ocup === t.id ? "Devolvendo…" : "Não é repetida: devolver à caixa"}</button></td>
          </tr>); })}</tbody></table></div>}
    </div>
  );
}
