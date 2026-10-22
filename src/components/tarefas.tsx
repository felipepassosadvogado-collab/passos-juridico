"use client";
// Tarefas: criação, lista enxuta, tabela de atividades e o detalhe com todo o fluxo
// (iniciar, enviar para correção com anexos, aprovar, devolver, protocolar, concluir).
// Quem pode o quê é conferido pelo banco; aqui os botões só aparecem para quem pode.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { calcularVencimento, dataValida, hojeBR, isoData, paraData, proximoDiaUtil, situacaoPrazo } from "@/lib/prazos";
import { bancoCurto, dataBR, dataHoraBR, nomeBonito } from "@/lib/formato";
import { TAREFAS, TAREFAS_GRUPOS, STATUS_NOME, rotuloCorrecao, destinoProtocolo } from "@/lib/regras";
import type { Documento, Tarefa } from "@/lib/tipos";
import { ChipResp, Avatar, Ic, SelResp, useConfirmar, tamanhoBR } from "./ui";
import { useJanelas } from "./janelas";
import { useVisor } from "./visor";

const EXT_OK = /\.(pdf|docx|xlsx)$/i;

/** cliente e réus da tarefa (do processo ou do atendimento pré-processual) */
export function usePartes() {
  const { processos, casos } = useDados();
  return (t: Tarefa) => {
    if (!t.processo_numero && t.caso_id) { const c = casos.get(t.caso_id); return { cli: nomeBonito(c?.nome || ""), reus: c?.banco ? ["x " + nomeBonito(c.banco), "Pré-processual"] : ["Pré-processual"], banco: c?.banco || "" }; }
    const p = t.processo_numero ? processos.get(t.processo_numero) : undefined;
    return { cli: nomeBonito(p?.cliente_nome || ""), reus: (p?.reus || []).map((r) => "x " + nomeBonito(r)), banco: p?.banco || "" };
  };
}

const ordemPrazo = (a: Tarefa, b: Tarefa) => (a.vencimento || "9999").localeCompare(b.vencimento || "9999");

export function CirculoStatus({ t }: { t: Tarefa }) {
  const tit = STATUS_NOME[t.status] || "Em aberto";
  return <span className={"st st-" + t.status} title={tit} aria-label={tit} />;
}

/** ações das tarefas, todas gravando no banco e atualizando a tela na hora */
export function useAcoesTarefa() {
  const { sb, eu, aplicar, remover, aviso, nome, tarefas, anexos } = useDados(); const protAte = useRef<string | undefined>(undefined);
  /** peça aprovada: cria a tarefa de protocolo para quem fez a peça, com a versão final anexada e o vencimento escolhido na aprovação */
  const criarProtocolo = async (t: Tarefa, ate?: string) => {
    if (!t.responsavel || t.tipo === "Protocolo da inicial" || t.tipo === "Protocolo da peça") return "";
    const inicial = t.tipo === "Elaboração de inicial" && !t.processo_numero; const tipo = inicial ? "Protocolo da inicial" : "Protocolo da peça";
    if ([...tarefas.values()].some((x) => x.status !== "feito" && (x.origem_id === t.id || (inicial && x.caso_id === t.caso_id && x.tipo === tipo)))) return "";
    const venc = ate || isoData(proximoDiaUtil(paraData(hojeBR())));
    const base = { caso_id: t.processo_numero ? null : t.caso_id, processo_numero: t.processo_numero, publicacao_id: t.publicacao_id, tipo, vencimento: venc, responsavel: t.responsavel, importante: true, urgente: t.urgente,
      descricao: inicial ? "Protocolo da inicial: protocolar no eproc e cadastrar o nº do processo" : "Protocolar: " + t.descricao.replace(/^Protocolar:\s*/, "") };
    let r = await sb.from("tarefas").insert({ ...base, origem_id: t.id }).select().single();
    if (r.error && /origem_id/.test(r.error.message)) r = await sb.from("tarefas").insert(base).select().single();
    const n = r.data as Tarefa | null;
    if (r.error || !n) return " Não consegui criar a tarefa de protocolo: " + msgErro(r.error);
    aplicar("tarefas", n);
    // vai a versão corrigida (se houver); senão, o que foi enviado para correção (e a pasta .zip da inicial)
    let copiados = 0; const docs = [...anexos.values()].filter((a) => a.tarefa_id === t.id); const dev = docs.filter((a) => a.etapa === "devolucao");
    for (const a of (dev.length ? [...dev, ...docs.filter((x) => x.etapa !== "devolucao" && /\.zip$/i.test(x.nome))] : docs)) {
      const caminho = `tarefas/${n.id}/${Date.now().toString(36)}-${a.caminho.split("/").pop()}`;
      const cp = await sb.storage.from("documentos").copy(a.caminho, caminho); if (cp.error) continue;
      const rd = await sb.from("documentos").insert({ tarefa_id: n.id, etapa: "envio", nome: a.nome, caminho, tamanho: a.tamanho, mime: a.mime }).select().single();
      if (rd.data) { aplicar("anexos", rd.data); copiados++; }
    }
    if (eu.id === t.responsavel) { const rf = await sb.from("tarefas").update({ status: "feito" }).eq("id", t.id).select().single(); if (rf.data) aplicar("tarefas", rf.data); }
    return ` Criei a tarefa “${tipo}” para ${nome(t.responsavel).split(" ")[0]}, vencendo em ${dataBR(venc)}${copiados ? ", com a peça anexada" : " (os arquivos continuam nesta tarefa)"}.`;
  };
  /** protocolo concluído: a peça aprovada que o originou também é concluída */
  const fecharInicial = async (t: Tarefa) => {
    if (t.tipo !== "Protocolo da inicial" && t.tipo !== "Protocolo da peça") return;
    const alvos = [...tarefas.values()].filter((x) => x.status === "aprovada" && x.responsavel === eu.id &&
      (t.origem_id ? x.id === t.origem_id : t.tipo === "Protocolo da inicial" && !!t.caso_id && x.caso_id === t.caso_id && x.tipo === "Elaboração de inicial"));
    for (const x of alvos) { const r = await sb.from("tarefas").update({ status: "feito" }).eq("id", x.id).select().single(); if (r.data) aplicar("tarefas", r.data); }
  };
  const gravar = async (t: Tarefa, campos: Partial<Tarefa>, ok?: string) => {
    let r: { data: unknown; error: unknown };
    try {
      r = await Promise.race([sb.from("tarefas").update(campos).eq("id", t.id).select().single(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tempo")), 20000))]);
    } catch { aviso("O servidor não respondeu. Recarregue a página (Cmd+R) e tente de novo."); return false; }
    const { data, error } = r;
    if (error) { aviso(msgErro(error)); return false; }
    aplicar("tarefas", data as Tarefa);
    if (campos.status === "feito") fecharInicial(t);
    if (campos.status === "aprovada") { const extra = await criarProtocolo(t, protAte.current); protAte.current = undefined; if (ok) aviso(ok + extra); return true; }
    if (ok) aviso(ok); return true;
  };
  const subir = async (t: Tarefa, files: File[], etapa: "envio" | "devolucao") => {
    const out: Documento[] = [];
    for (const f of files) {
      const caminho = `tarefas/${t.id}/${Date.now().toString(36)}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await sb.storage.from("documentos").upload(caminho, f, { contentType: f.type || undefined });
      if (up.error) throw new Error("Não consegui enviar " + f.name + ".");
      const { data, error } = await sb.from("documentos").insert({ tarefa_id: t.id, etapa, nome: f.name, caminho, tamanho: f.size, mime: f.type || null }).select().single();
      if (error) throw error;
      aplicar("anexos", data); out.push(data as Documento);
    }
    return out;
  };
  return {
    status: (t: Tarefa, st: Tarefa["status"]) => gravar(t, { status: st }, st === "feito" ? "Tarefa concluída." : st === "andamento" ? "Tarefa em andamento." : "Tarefa reaberta."),
    atribuir: (t: Tarefa, resp: string) => gravar(t, { responsavel: resp }, "Tarefa atribuída a " + nome(resp) + "."),
    flag: (t: Tarefa, campo: "importante" | "urgente") => gravar(t, { [campo]: !t[campo] }),
    editar: (t: Tarefa, campos: Partial<Tarefa>) => gravar(t, campos, "Tarefa atualizada."),
    /** aprova; "ate" é o vencimento da tarefa de protocolo que nasce da aprovação */
    aprovar: (t: Tarefa, ate?: string) => { protAte.current = ate; return gravar(t, { status: "aprovada" }, "Aprovada."); },
    /** registra o protocolo (nº e observação); data e hora são carimbadas pelo servidor no clique */
    protocolo: (t: Tarefa, concluir: boolean, numero = "", obs = "") => {
      const dest = destinoProtocolo(t, eu.id);
      const campos: Partial<Tarefa> = { protocolo_avisado_em: new Date().toISOString(), protocolo_numero: numero.trim() || null, protocolo_obs: obs.trim() || null };
      return gravar(t, concluir && t.status !== "feito" ? { ...campos, status: "feito" } : campos, dest ? "Protocolo registrado. " + nome(dest) + " foi avisado." : "Protocolo registrado.");
    },
    /** só anexa arquivos à tarefa (ex.: a minuta gerada pelo Claude), sem mudar a situação */
    anexar: async (t: Tarefa, files: File[]) => { try { return await subir(t, files, "envio"); } catch (e) { aviso(msgErro(e, (e as Error).message)); return null; } },
    /** troca o arquivo de um anexo pela versão editada (mesmo lugar no armazenamento) */
    substituir: async (d: Documento, f: File) => {
      const up = await sb.storage.from("documentos").upload(d.caminho, f, { upsert: true, contentType: f.type || undefined });
      if (up.error) { aviso("Não consegui enviar a versão editada: " + up.error.message); return null; }
      const { data, error } = await sb.from("documentos").update({ nome: f.name, tamanho: f.size, mime: f.type || d.mime }).eq("id", d.id).select().single();
      if (error) { aviso(msgErro(error)); return null; }
      aplicar("anexos", data); return data as Documento;
    },
    enviar: async (t: Tarefa, files: File[], nota: string, revisor: string, ate?: string) => {
      try { await subir(t, files, "envio"); } catch (e) { aviso(msgErro(e, (e as Error).message)); return false; }
      const campos: Partial<Tarefa> = { status: "revisao", revisor, nota_correcao: nota || null };
      const msg = "Enviado para correção de " + nome(revisor) + (ate ? " até " + dataBR(ate) : "") + ".";
      if (ate) {
        const r = await sb.from("tarefas").update({ ...campos, correcao_ate: ate }).eq("id", t.id).select().single();
        if (!r.error) { aplicar("tarefas", r.data); aviso(msg); return true; }
        if (!/correcao_ate/.test(r.error.message)) { aviso(msgErro(r.error)); return false; }
        aviso("Falta instalar a etapa 0013 (0013_prazo_correcao.sql) no Supabase; enviei sem a data da correção.");
      }
      return gravar(t, campos, msg);
    },
    devolver: async (t: Tarefa, files: File[], nota: string, ate?: string) => {
      try { await subir(t, files, "devolucao"); } catch (e) { aviso(msgErro(e, (e as Error).message)); return false; }
      const campos: Partial<Tarefa> = { status: "ajustes", nota_correcao: nota || null };
      const msg = "Devolvido para " + nome(t.responsavel) + " com os ajustes" + (ate ? ", para ajustar até " + dataBR(ate) : "") + ".";
      if (ate) {
        const r = await sb.from("tarefas").update({ ...campos, correcao_ate: ate }).eq("id", t.id).select().single();
        if (!r.error) { aplicar("tarefas", r.data); aviso(msg); return true; }
        if (!/correcao_ate/.test(r.error.message)) { aviso(msgErro(r.error)); return false; }
      }
      return gravar(t, campos, msg);
    },
    excluir: async (t: Tarefa) => {
      const { data, error } = await sb.from("tarefas").delete().eq("id", t.id).select("id");
      if (error) { aviso(msgErro(error)); return; }
      if (!data?.length) { aviso("Não foi possível excluir: só quem criou a tarefa (ou o titular) pode excluí-la."); return; }
      remover("tarefas", t.id); aviso("Tarefa excluída.");
    },
  };
}

export async function abrirArquivo(sb: ReturnType<typeof useDados>["sb"], caminho: string, aviso: (m: string) => void) {
  const w = window.open("", "_blank");
  const { data, error } = await sb.storage.from("documentos").createSignedUrl(caminho, 600);
  if (error || !data) { w?.close(); aviso("Não foi possível abrir o arquivo."); return; }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

export function ListaAnexos({ t }: { t: Tarefa }) {
  const { anexos, nome } = useDados(); const visor = useVisor();
  const lista = [...anexos.values()].filter((a) => a.tarefa_id === t.id).sort((a, b) => a.em.localeCompare(b.em));
  if (!lista.length) return null;
  return (
    <div className="anexos" onClick={(e) => e.stopPropagation()}>
      {lista.map((a) => (
        <button key={a.id} className="anexo" title="Ver o documento numa caixa ao lado" onClick={() => visor.verGuardado(a.caminho, a.nome, a.mime)}>
          <span className="ext">{(a.nome.split(".").pop() || "").toUpperCase()}</span><span className="an">{a.nome}</span>
          <span className="muted">{(a.etapa === "devolucao" ? "correção de " : "") + nome(a.por) + " · " + dataHoraBR(a.em) + " · " + tamanhoBR(a.tamanho || 0)}</span>
        </button>
      ))}
    </div>
  );
}

/** formulário de tarefa usado na publicação, no processo, no atendimento e em "Nova tarefa" */
export function FormTarefa({ numero, casoId, pub, tipo, desc, dias, resp, extra, onCriada, aoCriar, botoes }: {
  numero?: string | null; casoId?: string | null; pub?: { id: number; data: string; eproc: boolean } | null;
  tipo?: string | null; desc?: string; dias?: number | null; resp?: string | null; extra?: React.ReactNode;
  onCriada?: (t: Tarefa) => void; aoCriar?: () => Promise<void> | void; botoes?: React.ReactNode;
}) {
  const { sb, eu, aplicar, aviso, nome } = useDados(); const j = useJanelas();
  const [f, setF] = useState({ tipo: tipo && TAREFAS.includes(tipo) ? tipo : "", desc: desc || "", dias: dias ? String(dias) : "", venc: "", vencMan: false, resp: resp !== undefined ? resp : eu.id, imp: false, urg: false });
  const [ocupado, setOcupado] = useState(false);
  const auto = pub && +f.dias ? calcularVencimento(pub.data, +f.dias, pub.eproc) : "";
  const venc = f.vencMan ? f.venc : auto || f.venc;
  const criar = async () => {
    const det = f.desc.trim();
    if (!f.tipo && !det) { aviso("Escolha o tipo de tarefa ou escreva o detalhe."); return; }
    if (!dataValida(venc)) { aviso("Informe uma data de vencimento válida" + (pub ? " ou os dias úteis." : ".")); return; }
    const descricao = f.tipo && f.tipo !== "Outra" ? (det ? f.tipo + ": " + det : f.tipo) : det;
    setOcupado(true);
    const { data, error } = await sb.from("tarefas").insert({
      processo_numero: numero || null, caso_id: casoId || null, publicacao_id: pub?.id ?? null, tipo: f.tipo && f.tipo !== "Outra" ? f.tipo : null,
      descricao, vencimento: venc, dias: +f.dias || null, responsavel: f.resp || null, importante: f.imp, urgente: f.urg,
    }).select().single();
    setOcupado(false);
    if (error) { aviso(msgErro(error)); return; }
    aplicar("tarefas", data);
    await aoCriar?.();
    aviso("Tarefa criada para " + (f.resp === eu.id ? "você" : nome(f.resp)) + ", vence em " + dataBR(venc) + ".");
    onCriada?.(data as Tarefa);
  };
  return (
    <div className="tarefa">
      <div className="triage">
        <label className="f">Tarefa<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">— escolher —</option>{TAREFAS_GRUPOS.map(([g, l]) => <optgroup key={g} label={g}>{l.map((t) => <option key={t}>{t}</option>)}</optgroup>)}</select></label>
        <label className="f wide2">Detalhe<input value={f.desc} placeholder="Ex.: juntar comprovante de residência" onChange={(e) => setF({ ...f, desc: e.target.value })} /></label>
        {pub && <label className="f">Dias úteis<input type="number" min={1} value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value, vencMan: false })} /></label>}
        <label className="f">Prazo fatal<input type="date" value={venc} onChange={(e) => setF({ ...f, venc: e.target.value, vencMan: true })} /></label>
        <label className="f">Responsável<SelResp valor={f.resp} onChange={(v) => setF({ ...f, resp: v })} /></label>
        {extra}
        <div className="flags">
          <label className="chk imp"><input type="checkbox" checked={f.imp} onChange={(e) => setF({ ...f, imp: e.target.checked })} />Importante</label>
          <label className="chk urg"><input type="checkbox" checked={f.urg} onChange={(e) => setF({ ...f, urg: e.target.checked })} />Urgente</label>
        </div>
      </div>
      <div className="acts"><button className="btn primary" disabled={ocupado} onClick={criar}>{Ic.tarefa}{ocupado ? "Criando…" : "Criar tarefa"}</button>
        {numero && !pub && <button className="btn" title="Agendar audiência ou coleta neste processo" onClick={() => j.agendarAto(numero)}>📅 Agendar audiência / coleta</button>}
        {numero && <button className="btn" title="O Claude redige a peça em Word, no papel timbrado do escritório" onClick={() => j.gerarPeca({ numero, publicacaoId: pub?.id ?? null, tipo: f.tipo || null, orientacoes: f.desc })}>{Ic.claude}Gerar petição</button>}
        {botoes}</div>
    </div>
  );
}

/** envio para correção (responsável) e devolução com ajustes (quem corrige) */
export function FormRevisao({ t, modo, onFim }: { t: Tarefa; modo: "enviar" | "devolver"; onFim: () => void }) {
  const { eu, equipe, aviso } = useDados();
  const acoes = useAcoesTarefa();
  const ops = equipe.filter((p) => p.ativo && (p.id !== eu.id || eu.papel === "titular"));
  const padrao = t.criado_por && t.criado_por !== eu.id ? t.criado_por : t.revisor && t.revisor !== eu.id ? t.revisor : ops[0]?.id || "";
  const [files, setFiles] = useState<File[]>([]); const [nota, setNota] = useState(""); const [rev, setRev] = useState(padrao); const [ocupado, setOcupado] = useState(false);
  const [ate, setAte] = useState(() => isoData(proximoDiaUtil(paraData(hojeBR()))));
  const ir = async () => {
    if (modo === "enviar" && !files.length) { aviso("Anexe a peça que vai para correção."); return; }
    if (modo === "enviar" && !rev) { aviso("Escolha quem vai corrigir. Convide a pessoa em Equipe, se faltar."); return; }
    if (modo === "devolver" && !nota.trim() && !files.length) { aviso("Escreva o que precisa ajustar ou anexe a versão corrigida."); return; }
    setOcupado(true);
    const ok = modo === "enviar" ? await acoes.enviar(t, files, nota.trim(), rev, ate) : await acoes.devolver(t, files, nota.trim(), ate);
    setOcupado(false); if (ok) onFim();
  };
  return (
    <div className="triage edit-t" onClick={(e) => e.stopPropagation()}>
      <label className="f wide">{modo === "enviar" ? "Anexe a peça para correção (PDF, Word .docx ou Excel .xlsx, até 20 MB)" : "Anexe a versão corrigida (opcional)"}
        <input type="file" multiple accept=".pdf,.docx,.xlsx" onChange={(e) => {
          const novos: File[] = [];
          for (const f of Array.from(e.target.files || [])) { if (!EXT_OK.test(f.name)) { aviso(f.name + ": use PDF, .docx ou .xlsx."); continue; } if (f.size > 20 * 1048576) { aviso(f.name + " passa de 20 MB."); continue; } novos.push(f); }
          setFiles((x) => [...x, ...novos]); e.target.value = "";
        }} /></label>
      {files.length > 0 && <div className="wide anexos">{files.map((f, i) => (
        <span key={i} className="anexo"><span className="ext">{(f.name.split(".").pop() || "").toUpperCase()}</span><span className="an">{f.name}</span><span className="muted">{tamanhoBR(f.size)}</span>
          <button className="btn ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Excluir</button></span>))}</div>}
      <label className="f wide">{modo === "enviar" ? "Recado para quem vai corrigir" : "O que precisa ser ajustado"}<textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {modo === "enviar" && <label className="f">Enviar para<select value={rev} onChange={(e) => setRev(e.target.value)}>{ops.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu.id ? " (você)" : ""}</option>)}</select></label>}
      <label className="f">{modo === "enviar" ? "Corrigir até" : "Ajustar até"}<input type="date" value={ate} min={hojeBR()} onChange={(e) => setAte(e.target.value)} /></label>
      <div className="tools"><button className="btn primary" disabled={ocupado} onClick={ir}>{ocupado ? "Enviando…" : modo === "enviar" ? "Enviar para correção" : "Devolver com ajustes"}</button></div>
    </div>
  );
}

export function FormEdicao({ t, onFim }: { t: Tarefa; onFim: () => void }) {
  const { aviso } = useDados(); const acoes = useAcoesTarefa();
  const detalhe = t.tipo && t.descricao.startsWith(t.tipo + ": ") ? t.descricao.slice(t.tipo.length + 2) : t.tipo === t.descricao ? "" : t.descricao;
  const [f, setF] = useState({ tipo: t.tipo || "", desc: detalhe, venc: t.vencimento || "", imp: t.importante, urg: t.urgente });
  const salvar = async () => {
    if (!f.tipo && !f.desc.trim()) { aviso("A tarefa precisa de tipo ou detalhe."); return; }
    if (!dataValida(f.venc)) { aviso("Informe uma data de vencimento válida."); return; }
    const descricao = f.tipo && f.tipo !== "Outra" ? (f.desc.trim() ? f.tipo + ": " + f.desc.trim() : f.tipo) : f.desc.trim();
    if (descricao === t.descricao && f.venc === t.vencimento && f.imp === t.importante && f.urg === t.urgente) { onFim(); return; }
    if (await acoes.editar(t, { tipo: f.tipo && f.tipo !== "Outra" ? f.tipo : null, descricao, vencimento: f.venc, importante: f.imp, urgente: f.urg })) onFim();
  };
  return (
    <div className="triage edit-t" onClick={(e) => e.stopPropagation()}>
      <label className="f">Tarefa<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">— sem tipo —</option>{TAREFAS_GRUPOS.map(([g, l]) => <optgroup key={g} label={g}>{l.map((x) => <option key={x}>{x}</option>)}</optgroup>)}</select></label>
      <label className="f wide2">Detalhe<input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></label>
      <label className="f">Prazo fatal<input type="date" value={f.venc} onChange={(e) => setF({ ...f, venc: e.target.value })} /></label>
      <label className="f">Responsável<div style={{ padding: "7px 0" }}><ChipResp id={t.responsavel} /></div></label>
      <div className="flags">
        <label className="chk imp"><input type="checkbox" checked={f.imp} onChange={(e) => setF({ ...f, imp: e.target.checked })} />Importante</label>
        <label className="chk urg"><input type="checkbox" checked={f.urg} onChange={(e) => setF({ ...f, urg: e.target.checked })} />Urgente</label>
      </div>
      <div className="tools"><button className="btn primary" onClick={salvar}>Salvar alterações</button></div>
    </div>
  );
}

export function TabelaTarefas({ lista, mostrarProc = true, limite = 300 }: { lista: Tarefa[]; mostrarProc?: boolean; limite?: number }) {
  const { nome, eu, titular, aviso } = useDados(); const acoes = useAcoesTarefa(); const partes = usePartes(); const j = useJanelas();
  if (!lista.length) return <div className="empty">Nenhuma tarefa.</div>;
  const hoje = hojeBR();
  const flag = (t: Tarefa, campo: "importante" | "urgente") => {
    if (!(titular || t.criado_por === eu.id) || t.status === "feito") { aviso("Só quem criou a tarefa pode marcar como " + campo + "."); return; }
    acoes.flag(t, campo);
  };
  return (
    <div className="tscroll">
      <table className="grid ativ"><thead><tr><th /><th>Tarefa</th>{mostrarProc && <th>Partes</th>}<th>Prazo fatal</th><th>Responsável</th></tr></thead>
        <tbody>{lista.slice(0, limite).flatMap((t) => {
          const done = t.status === "feito"; const fatal = !!t.vencimento && !done && t.vencimento <= hoje;
          const { cli, reus } = partes(t); const rc = rotuloCorrecao(t, nome);
          return [
            <tr key={t.id} id={"tar-" + t.id} className={"tr-t" + (done ? " feita" : "")} tabIndex={0} onClick={() => j.abrirTarefa(t.id)} onKeyDown={(e) => { if (e.key === "Enter") j.abrirTarefa(t.id); }}>
              <td className="marcas" onClick={(e) => e.stopPropagation()}>
                <button className={"mk estrela" + (t.importante ? " on" : "")} title={t.importante ? "Importante" : "Marcar como importante"} onClick={() => flag(t, "importante")}>{Ic.estrela(t.importante)}</button>
                <button className={"mk urg" + (t.urgente ? " on" : "")} title={t.urgente ? "Urgente" : "Marcar como urgente"} onClick={() => flag(t, "urgente")}>!</button>
                <CirculoStatus t={t} />
              </td>
              <td><div className="tnome">{t.descricao}</div>
                {rc && !done ? <div className="tsub"><span className={"pill " + rc[0]}>{rc[1]}</span></div> : t.status === "andamento" ? <div className="tsub"><span className="pill acc">em andamento</span></div> : null}</td>
              {mostrarProc && <td className="partes"><div className="pc">{cli || "—"}</div>{reus.map((r, i) => <div key={i} className="pr">{r}</div>)}</td>}
              <td className={"num" + (fatal ? " fatal" : "") + (done ? " ok" : "")}>{dataBR(t.vencimento)}</td>
              <td className="rcol"><Avatar id={t.responsavel} /><span className="rn">{t.responsavel ? nome(t.responsavel) : "Sem responsável"}</span></td>
            </tr>,
          ];
        })}</tbody></table>
      {lista.length > limite && <div className="muted" style={{ padding: "10px 16px" }}>Mostrando {limite} de {lista.length}. Use a busca.</div>}
    </div>
  );
}

/** lista enxuta: uma linha por tarefa; o clique abre o detalhe */
export function ListaEnxuta({ lista, limite = 8, abrirId }: { lista: Tarefa[]; limite?: number; abrirId?: string | null }) {
  const { nome } = useDados(); const partes = usePartes(); const j = useJanelas();
  const [todos, setTodos] = useState(false);
  const abriu = useRef(""); useEffect(() => { if (abrirId && abriu.current !== abrirId) { abriu.current = abrirId; j.abrirTarefa(abrirId); } }, [abrirId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista.length) return <div className="empty">Nada aqui.</div>;
  const l = [...lista].sort(ordemPrazo); const vis = todos ? l : l.slice(0, limite);
  return (
    <div className="lx">
      {vis.flatMap((t) => {
        const done = t.status === "feito"; const s = done ? { cor: "ok", texto: "cumprida" } : situacaoPrazo(t.vencimento);
        const { cli, banco } = partes(t); const rc = rotuloCorrecao(t, nome);
        return [
          <div key={t.id} className="lx-row" tabIndex={0} role="button"
            onClick={() => j.abrirTarefa(t.id)} onKeyDown={(e) => { if (e.key === "Enter") j.abrirTarefa(t.id); }}>
            <CirculoStatus t={t} />
            <div className="lx-main"><div className="lx-t">{t.urgente && <span className="lx-flag urg" title="Urgente">!</span>}{t.importante && <span className="lx-flag imp" title="Importante">★</span>}{t.descricao}</div>
              <div className="lx-s">{[cli, banco ? bancoCurto(banco) : "", t.responsavel ? nome(t.responsavel) : "sem responsável"].filter(Boolean).join(" · ")}</div></div>
            {rc && !done ? <span className={"pill " + rc[0]}>{rc[0] === "acc" ? "em correção" : rc[0] === "soon" ? "ajustes" : "aprovada"}</span> : <span />}
            <span className={"lx-prazo " + s.cor} title={s.texto}><span className="lx-data">{t.vencimento ? dataBR(t.vencimento) : "sem prazo"}</span><span className="lx-rel">{t.vencimento ? s.texto : ""}</span></span>
          </div>,
        ];
      })}
      {l.length > limite && <button className="lx-mais" onClick={() => setTodos(!todos)}>{todos ? "Mostrar menos" : `Ver todas (${l.length})`}</button>}
    </div>
  );
}

/** tarefa em miniatura (na publicação e na linha do tempo) */
export function MiniTarefa({ t, onClick }: { t: Tarefa; onClick?: () => void }) {
  const j = useJanelas(); onClick = onClick || (() => j.abrirTarefa(t.id));
  const s = situacaoPrazo(t.vencimento); const done = t.status === "feito", and = t.status === "andamento";
  return (
    <button className="mini" onClick={onClick}>
      <ChipResp id={t.responsavel} /><span className="mt">{t.descricao}</span>
      <span className={"pill " + (done ? "ok" : and ? "acc" : s.cor)}>{done ? "cumprida" : (and ? "em andamento · " : "") + "vence " + dataBR(t.vencimento) + (and ? "" : " · " + s.texto)}</span>
    </button>
  );
}
