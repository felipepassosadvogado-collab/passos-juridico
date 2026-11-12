"use client";
// Jornada do atendimento (pré-processual → processual) na janela de qualquer tarefa ligada a um atendimento:
// cliente cadastrado → atendimento aberto → etapas → elaboração da inicial → idas e voltas da correção →
// protocolo → processo distribuído. Em cima, com quem está agora e o próximo passo.
import { useEffect, useState } from "react";
import { useDados } from "@/lib/dados";
import { dataHoraBR, nomeBonito } from "@/lib/formato";
import { STATUS_NOME } from "@/lib/regras";
import type { Evento, Tarefa } from "@/lib/tipos";
import { useJanelas } from "./janelas";
import { useVisor } from "./visor";

const DA_TAREFA = ["tarefa_criada", "correcao_enviada", "correcao_devolvida", "correcao_aprovada", "protocolo_avisado", "tarefa_concluida"];

export function JornadaAtendimento({ t, eu }: { t: Tarefa; eu: string }) {
  const { sb, casos, clientes, tarefas, anexos, nome } = useDados(); const j = useJanelas(); const visor = useVisor();
  const caso = t.caso_id ? casos.get(t.caso_id) : undefined;
  const doCaso = caso ? [...tarefas.values()].filter((x) => x.caso_id === caso.id) : [];
  const [evs, setEvs] = useState<Evento[] | null>(null);
  const chave = doCaso.map((x) => x.id + x.status + (x.editado_em || "")).join("|") + (caso?.etapa || "");
  useEffect(() => {
    if (!caso) return;
    const ids = doCaso.map((x) => x.id);
    Promise.all([sb.from("eventos").select("*").eq("caso_id", caso.id).order("em"), ids.length ? sb.from("eventos").select("*").in("tarefa_id", ids).order("em") : Promise.resolve({ data: [] })])
      .then(([a, b]: { data: unknown }[]) => { const m = new Map<number, Evento>(); for (const e of [...((a.data as Evento[]) || []), ...((b.data as Evento[]) || [])]) m.set(e.id, e); setEvs([...m.values()].sort((x, y) => x.em.localeCompare(y.em))); });
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!caso) return null;
  const cli = caso.cliente_id ? clientes.get(caso.cliente_id) : undefined;
  const pri = (id: string | null | undefined) => (!id ? "alguém" : id === eu ? "você" : nome(id).split(" ")[0]);
  const Cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  const tarefaDe = (id: string | null) => (id ? tarefas.get(id) : undefined);

  // agora: a tarefa aberta mais adiantada do atendimento (protocolo > correção > elaboração), senão a etapa
  const abertas = doCaso.filter((x) => x.status !== "feito");
  const ordem = (x: Tarefa) => (/^protocol/i.test(x.tipo || x.descricao) ? 0 : ["revisao", "ajustes", "aprovada"].includes(x.status) ? 1 : 2);
  const atual = abertas.sort((a, b) => ordem(a) - ordem(b))[0];
  const agora: [string, string, string] = caso.processo_numero ? ["ok", "Protocolado", "O atendimento virou processo; o andamento segue na aba do processo."]
    : !atual ? ["acc", "Etapa: " + caso.etapa, "Nenhuma tarefa aberta neste atendimento."]
    : atual.status === "revisao" ? ["acc", `Inicial com ${pri(atual.revisor)} para corrigir`, `${Cap(pri(atual.responsavel))} enviou; falta aprovar ou devolver com ajustes.`]
    : atual.status === "ajustes" ? ["soon", `Inicial voltou para ${pri(atual.responsavel)} ajustar`, `${Cap(pri(atual.revisor))} pediu ajustes; falta corrigir e reenviar.`]
    : /^protocol/i.test(atual.tipo || atual.descricao) ? ["ok", `Pronta para protocolar · com ${pri(atual.responsavel)}`, "A inicial foi aprovada; falta protocolar e informar o número do processo."]
    : atual.status === "aprovada" ? ["ok", `Aprovada · com ${pri(atual.responsavel)}`, "Falta protocolar."]
    : [/^elabora/i.test(atual.tipo || atual.descricao) ? "acc" : "", `${atual.descricao.split(":")[0]} · com ${pri(atual.responsavel)}`, atual.status === "andamento" ? "Em andamento." : "Ainda não iniciada."];
  const proximo = caso.processo_numero ? "" : !atual ? "criar a tarefa da próxima etapa" : atual.status === "revisao" ? `${pri(atual.revisor)} aprova (cria o protocolo) ou devolve` : atual.status === "ajustes" ? `${pri(atual.responsavel)} ajusta e reenvia para ${pri(atual.revisor)}`
    : /^protocol/i.test(atual.tipo || atual.descricao) ? `${pri(atual.responsavel)} protocola e informa o nº do processo` : atual.status === "aprovada" ? `${pri(atual.responsavel)} protocola` : `${pri(atual.responsavel)} faz e envia para correção`;

  const arquivosDe = (e: Evento) => (((e.dados || {}) as { arquivos?: string[] }).arquivos || []).map((n) => [...anexos.values()].filter((a) => a.tarefa_id === e.tarefa_id && a.nome === n)
    .sort((a, b) => Math.abs(Date.parse(a.em) - Date.parse(e.em)) - Math.abs(Date.parse(b.em) - Date.parse(e.em)))[0] || { nome: n, caminho: "", mime: "" });
  type Passo = { id: string; em: string; cor: string; rot: string; nota?: string; tarefa?: Tarefa; ev?: Evento; acao?: () => void; rotAcao?: string };
  const passos: Passo[] = [];
  if (cli?.criado_em && cli.criado_em < caso.criado_em) passos.push({ id: "cli", em: cli.criado_em, cor: "", rot: "Cliente cadastrado" });
  passos.push({ id: "caso", em: caso.criado_em, cor: "", rot: `${Cap(pri(caso.criado_por))} abriu o atendimento` + (caso.banco ? ` contra ${caso.banco}` : "") });
  for (const e of evs || []) {
    const d = (e.dados || {}) as Record<string, string>; const tf = tarefaDe(e.tarefa_id); const qual = tf && tf.id !== t.id ? ` (“${tf.descricao}”)` : "";
    if (e.tipo === "fase" && !e.tarefa_id) { passos.push({ id: "e" + e.id, em: e.em, cor: /protocolado/i.test(d.fase || "") ? "ok" : "", rot: "Etapa: " + (d.fase || ""), acao: /protocolado/i.test(d.fase || "") && caso.processo_numero ? () => j.abrirProcesso(caso.processo_numero!) : undefined, rotAcao: "abrir o processo" }); continue; }
    if (!e.tarefa_id || !DA_TAREFA.includes(e.tipo)) continue;
    if (e.tipo === "tarefa_criada") passos.push({ id: "e" + e.id, em: e.em, cor: "", rot: `${Cap(pri(e.por))} criou a tarefa “${tf?.descricao || d.descricao || ""}”` + ((d.responsavel || tf?.responsavel) && (d.responsavel || tf?.responsavel) !== e.por ? ` para ${pri(d.responsavel || tf?.responsavel)}` : ""), tarefa: tf, acao: tf && tf.id !== t.id ? () => j.abrirTarefa(tf.id) : undefined, rotAcao: tf ? (STATUS_NOME[tf.status] || "").toLowerCase() + " · abrir" : undefined });
    else if (e.tipo === "correcao_enviada") passos.push({ id: "e" + e.id, em: e.em, cor: "acc", rot: `${Cap(pri(e.por))} enviou para correção${qual}`, nota: d.nota, ev: e });
    else if (e.tipo === "correcao_devolvida") passos.push({ id: "e" + e.id, em: e.em, cor: "soon", rot: `${Cap(pri(e.por))} devolveu com ajustes${qual}`, nota: d.nota, ev: e });
    else if (e.tipo === "correcao_aprovada") passos.push({ id: "e" + e.id, em: e.em, cor: "ok", rot: `${Cap(pri(e.por))} aprovou${qual}` });
    else if (e.tipo === "protocolo_avisado") passos.push({ id: "e" + e.id, em: e.em, cor: "ok", rot: `${Cap(pri(e.por))} protocolou${qual}`, nota: d.numero });
    else passos.push({ id: "e" + e.id, em: e.em, cor: "ok", rot: `${Cap(pri(e.por))} concluiu${qual || ` “${tf?.descricao || ""}”`}` });
  }
  passos.sort((a, b) => a.em.localeCompare(b.em));
  // o recado da última ida/volta desta tarefa já aparece inteiro na caixa logo abaixo
  const ultimaNota = t.nota_correcao && ["revisao", "ajustes"].includes(t.status) ? [...passos].reverse().find((x) => x.ev?.tarefa_id === t.id)?.id : undefined;
  return (
    <div className={"tj-fluxo " + agora[0]}>
      <div className="tj-fluxo-agora"><span className="muted s" style={{ flexBasis: "100%" }}>Atendimento de {nomeBonito(cli?.nome || caso.nome)} · do cadastro ao protocolo</span>
        <span className={"pill " + agora[0]}>{agora[1]}</span><div className="s">{agora[2]}</div></div>
      {evs === null ? <div className="muted s" role="status">Carregando a jornada…</div> :
        <ol className="tj-fluxo-passos" aria-label="Jornada do atendimento">
          {passos.map((x) => <li key={x.id} className={x.cor + (x.tarefa?.id === t.id || x.ev?.tarefa_id === t.id ? " atual" : "")}><span className="pt" aria-hidden="true" />
            <div><b>{x.rot}</b> <span className="muted s">· {dataHoraBR(x.em)}</span>{x.acao && <> <button className="reflink s" onClick={x.acao}>{x.rotAcao}</button></>}
              {x.nota && x.id !== ultimaNota && <div className="s nota">“{x.nota.length > 160 ? x.nota.slice(0, 160) + "…" : x.nota}”</div>}
              {x.ev && arquivosDe(x.ev).length > 0 && <div className="tj-fluxo-arqs">{arquivosDe(x.ev).map((a, k) => a.caminho
                ? <button key={k} className="anexo mini" title="Ver este documento ao lado" onClick={() => visor.verGuardado(a.caminho, a.nome, a.mime)}><span className="ext">{(a.nome.split(".").pop() || "").toUpperCase()}</span><span className="an">{a.nome}</span></button>
                : <span key={k} className="muted s">{a.nome}</span>)}</div>}</div></li>)}
          {proximo && <li className="prox"><span className="pt" aria-hidden="true" /><div className="muted"><b>Próximo passo:</b> {proximo}</div></li>}
        </ol>}
    </div>
  );
}
