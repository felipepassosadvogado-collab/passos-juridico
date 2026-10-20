import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirMembro, mapaEquipe } from "@/lib/sessao";
import { FormDadosProcesso, FormComentario } from "@/components/FormsProcesso";
import { dataBR, dataHoraBR, iniciais, nomeBonito } from "@/lib/formato";
import { infoCnj } from "@/lib/cnj";
import { situacaoPrazo } from "@/lib/prazos";
import type { Evento, Processo, Publicacao, Tarefa } from "@/lib/tipos";

const ROTULO: Record<string, string> = {
  tarefa_criada: "Criou a tarefa", tarefa_iniciada: "Começou a tarefa", correcao_enviada: "Enviou para correção", correcao_devolvida: "Devolveu com ajustes",
  correcao_aprovada: "Aprovou a peça", tarefa_concluida: "Concluiu a tarefa", tarefa_reaberta: "Reabriu a tarefa", tarefa_editada: "Editou a tarefa",
  tarefa_atribuida: "Atribuiu a tarefa", protocolo_avisado: "Avisou o protocolo", processo_cadastrado: "Cadastrou o processo",
  fase: "Mudou a fase", responsavel: "Mudou o responsável", comentario: "", analise_concluida: "Concluiu a análise da publicação",
  cliente_avisado: "Avisou o cliente", aviso_criado: "Marcou para avisar o cliente", importado: "Importado do painel antigo",
};

export async function generateMetadata({ params }: { params: Promise<{ numero: string }> }) { return { title: "Processo " + (await params).numero }; }

export default async function FichaProcesso({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const { sb } = await exigirMembro();
  const [{ data: p }, { data: pubs }, { data: evs }, { data: ts }, { data: cls }, eq] = await Promise.all([
    sb.from("processos").select("*").eq("numero", numero).maybeSingle<Processo>(),
    sb.from("publicacoes").select("*").eq("processo_numero", numero).order("data"),
    sb.from("eventos").select("*").eq("processo_numero", numero).order("em"),
    sb.from("tarefas").select("*").eq("processo_numero", numero).order("vencimento"),
    sb.from("clientes").select("id,nome").order("nome").limit(5000),
    mapaEquipe(sb),
  ]);
  if (!p) notFound();
  const info = infoCnj(p.numero);
  const tarefas = (ts || []) as Tarefa[];
  type Item = { t: string; pub?: Publicacao; ev?: Evento };
  const itens: Item[] = [
    ...((pubs || []) as Publicacao[]).map((x) => ({ t: x.data + "T08:00:00-03:00", pub: x })),
    ...((evs || []) as Evento[]).map((x) => ({ t: x.em, ev: x })),
  ].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  const equipe = eq.lista.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome }));
  return (
    <>
      <div className="pg"><div><h1>{nomeBonito(p.cliente_nome) || "—"}</h1><div className="sub mono">{p.mascara}</div></div>
        {p.cliente_id && <Link className="btn" href={"/clientes/" + p.cliente_id}>Ficha do cliente</Link>}</div>
      <section className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <dl className="kv">
          <dt>Réus</dt><dd>{p.reus.map(nomeBonito).join("; ") || "—"}</dd>
          <dt>Juízo</dt><dd>{p.orgao || "—"}</dd>
          <dt>Tribunal</dt><dd>{[p.tribunal || info?.tribunal, info?.ramo].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Classe</dt><dd>{p.classe || "—"}</dd>
        </dl>
        <FormDadosProcesso numero={p.numero} fase={p.fase} responsavel={p.responsavel} clienteId={p.cliente_id} notas={p.notas}
          clientes={(cls || []).map((c) => ({ id: c.id, nome: nomeBonito(c.nome) }))} equipe={equipe} />
      </div></section>
      <section className="panel"><div className="ph"><h3>Tarefas</h3></div>
        {tarefas.length ? <table className="grid"><tbody>{tarefas.map((t) => { const s = situacaoPrazo(t.vencimento); return (
          <tr key={t.id}><td className="forte">{t.descricao}</td><td>{eq.nome(t.responsavel)}</td>
            <td className="mono">{dataBR(t.vencimento)}</td>
            <td>{t.status === "feito" ? <span className="pill ok">cumprida</span> : <span className={"pill " + s.cor}>{s.texto}</span>}</td></tr>); })}
        </tbody></table> : <div className="empty">Nenhuma tarefa neste processo.</div>}
      </section>
      <section className="panel"><div className="ph"><h3>Linha do tempo</h3><span className="muted" style={{ fontSize: 12 }}>{itens.length} registros</span></div>
        <div className="tl">{itens.length ? itens.map((it) => it.pub ? (
          <div className="ev" key={"p" + it.pub.id}><span className="av sys">DJ</span><div className="bub">
            <div className="bh"><b>{it.pub.tipo_doc && it.pub.tipo_doc !== "Outros" ? it.pub.tipo_doc : it.pub.tipo_com || "Publicação"}</b> · {it.pub.orgao || "DJEN"} · {dataBR(it.pub.data)}</div>
            {(it.pub.texto || "").length > 700
              ? <details className="txt"><summary>Mostrar a publicação inteira</summary>{it.pub.texto}</details>
              : <div className="txt">{it.pub.texto}</div>}
            {it.pub.link && <a href={it.pub.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Abrir no eproc ↗</a>}
          </div></div>
        ) : it.ev && (
          <div className="ev" key={"e" + it.ev.id}><span className="av">{iniciais(eq.nome(it.ev.por))}</span><div className="bub">
            <div className="bh"><b>{eq.nome(it.ev.por)}</b> · {dataHoraBR(it.ev.em)}</div>
            <div className="txt">{textoEvento(it.ev, eq.nome)}</div>
          </div></div>
        )) : <div className="empty">Nada registrado ainda.</div>}</div>
        <FormComentario numero={p.numero} />
      </section>
    </>
  );
}

function textoEvento(e: Evento, nome: (id?: string | null) => string): string {
  const d = e.dados as Record<string, string | number | boolean | null>;
  const base = ROTULO[e.tipo] ?? e.tipo;
  if (e.tipo === "comentario") return String(d.texto || "");
  if (e.tipo === "fase") return `${base}: ${d.fase || "sem fase"}.`;
  if (e.tipo === "responsavel") return `${base}: ${nome(d.responsavel as string)}.`;
  if (e.tipo.startsWith("tarefa_") || e.tipo.startsWith("correcao_") || e.tipo === "protocolo_avisado") {
    const resp = d.responsavel ? ` · responsável: ${nome(d.responsavel as string)}` : "";
    const venc = d.vencimento ? ` · prazo ${dataBR(String(d.vencimento))}` : "";
    return `${base}: ${d.descricao || ""}${e.tipo === "tarefa_criada" ? resp + venc : ""}${d.protocolo_avisado ? " · protocolo avisado" : ""}`;
  }
  return d.texto ? `${base}: ${d.texto}` : base;
}
