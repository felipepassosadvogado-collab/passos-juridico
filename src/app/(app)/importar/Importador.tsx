"use client";
import { useState } from "react";
import JSZip from "jszip";
import { importarLote, limparEventosDasTarefas, jaImportado, clientesPorCpf } from "./acoes";
import { supabaseNavegador } from "@/lib/supabase/client";
import { semAcento } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Exp = Record<string, any>;

// id do painel antigo → uuid fixo (rodar a importação de novo não duplica)
async function uuidDe(chave: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode("passos-juridico:" + chave))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const dataOuNull = (s: any) => (typeof s === "string" && /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : null);
const tsOuNull = (s: any) => (typeof s === "string" && !isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
const MAPA_FASE: Record<string, string> = { "Inicial / citação": "Protocolo / citação", "Contestação / réplica": "Réplica", "Perícia grafotécnica": "Perícia / instrução", "Manifestação ao laudo": "Perícia / instrução", "Audiência": "Perícia / instrução" };
const STATUS = new Set(["aberto", "andamento", "revisao", "ajustes", "aprovada", "feito"]);

export function Importador({ equipe, eu }: { equipe: Perfil[]; eu: string }) {
  const [dados, setDados] = useState<Exp | null>(null);
  const [zip, setZip] = useState<JSZip | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  const add = (l: string) => setLog((x) => [...x, l]);

  async function abrir(f: File) {
    setErro(""); setLog([]);
    try {
      let txt: string, z: JSZip | null = null;
      if (/\.zip$/i.test(f.name)) { z = await JSZip.loadAsync(f); const j = z.file("dados.json"); if (!j) throw new Error("O arquivo .zip não tem dados.json."); txt = await j.async("string"); }
      else txt = await f.text();
      const d = JSON.parse(txt);
      if (!d.processos) throw new Error("Esse arquivo não é uma exportação do painel.");
      setDados(d); setZip(z);
      // tenta casar cada pessoa do painel com um membro do sistema pelo nome
      const m: Record<string, string> = {};
      for (const p of pessoas(d)) { const alvo = equipe.find((e) => semAcento(e.nome) === semAcento(p.nome)) || (p.eu ? equipe.find((e) => e.id === eu) : undefined); m[p.chave] = alvo?.id || ""; }
      setMapa(m);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo."); }
  }

  function pessoas(d: Exp) {
    const l: { chave: string; nome: string; eu?: boolean }[] = [];
    for (const m of d.equipe || []) l.push({ chave: m.id, nome: m.nome, eu: m.userId && m.userId === d.exportadoPor });
    const conhecidos = new Set((d.equipe || []).flatMap((m: Exp) => [m.id, m.userId].filter(Boolean)));
    const soltos = new Set<string>();
    for (const t of d.prazos || []) for (const k of [t.resp, t.criadoPor, t.revisor]) if (k && !conhecidos.has(k)) soltos.add(k);
    for (const k of soltos) l.push({ chave: k, nome: k === d.exportadoPor ? "Você (no painel antigo)" : "Pessoa sem cadastro (" + k.slice(0, 8) + "…)", eu: k === d.exportadoPor });
    return l;
  }
  // um id do painel (membro ou conta) → perfil novo
  function pessoa(d: Exp, k?: string | null): string | null {
    if (!k) return null;
    if (mapa[k] !== undefined) return mapa[k] || null;
    const m = (d.equipe || []).find((x: Exp) => x.userId === k);
    return m ? mapa[m.id] || null : null;
  }

  async function lotes(tabela: Parameters<typeof importarLote>[0], linhas: Record<string, unknown>[], tam = 150) {
    for (let i = 0; i < linhas.length; i += tam) {
      const r = await importarLote(tabela, linhas.slice(i, i + tam));
      if ("erro" in r && r.erro) throw new Error(r.erro);
      setLog((x) => [...x.slice(0, -1), `${tabela}: ${Math.min(i + tam, linhas.length)} de ${linhas.length}`]);
    }
  }

  async function importar() {
    if (!dados) return;
    setRodando(true); setErro(""); setLog([]);
    const d = dados; const inicio = new Date().toISOString();
    try {
      if (await jaImportado()) add("Já houve uma importação antes: os registros serão atualizados, sem duplicar.");
      // clientes: o mesmo CPF cadastrado duas vezes no painel antigo vira um cliente só
      const cliId: Record<string, string> = {};
      const jaNoBanco = await clientesPorCpf();
      const porCpf = new Map<string, Exp[]>(); const semCpf: Exp[] = [];
      for (const c of d.clientes || []) { const k = String(c.cpf || "").replace(/\D/g, ""); if (k) porCpf.set(k, [...(porCpf.get(k) || []), c]); else semCpf.push(c); }
      const unicos: { id: string; c: Exp }[] = [];
      let juntados = 0;
      for (const [k, grupo] of porCpf) {
        // o cadastro mais antigo é a base; os outros só preenchem o que estiver vazio
        grupo.sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || "")));
        const c: Exp = { ...grupo[0] };
        for (const o of grupo.slice(1)) for (const [campo, v] of Object.entries(o)) if (v && !c[campo]) c[campo] = v;
        c.docs = grupo.flatMap((o) => o.docs || []);
        const id = jaNoBanco[k] || (await uuidDe("cli:" + grupo[0].id));
        for (const o of grupo) cliId[o.id] = id;
        unicos.push({ id, c }); juntados += grupo.length - 1;
      }
      for (const c of semCpf) { cliId[c.id] = await uuidDe("cli:" + c.id); unicos.push({ id: cliId[c.id], c }); }
      if (juntados) add(`${juntados} cliente(s) com CPF repetido no painel antigo foram juntados num cadastro só.`);
      add("clientes");
      await lotes("clientes", unicos.map(({ id, c }) => ({
        id, nome: c.nome || "Sem nome", cpf: c.cpf || null, rg: c.rg || null, nascimento: dataOuNull(c.nascimento), nacionalidade: c.nacionalidade || null,
        estado_civil: c.estadoCivil || null, profissao: c.profissao || null, nome_mae: c.nomeMae || null, telefone: c.telefone || null, email: c.email || null,
        endereco: c.endereco || null, cep: c.cep || null, cidade: c.cidade || null, nb: c.nb || null, obs: c.obs || null, criado_em: tsOuNull(c.criadoEm) || inicio,
      })));
      // processos
      add("processos");
      await lotes("processos", (d.processos || []).filter((p: Exp) => /^\d{20}$/.test(p.numero)).map((p: Exp) => ({
        numero: p.numero, tribunal: p.tribunal || null, orgao: p.orgao || null, cidade: p.cidade || null, classe: p.classe || null,
        cliente_id: p.clienteId ? cliId[p.clienteId] || null : null, cliente_nome: p.cliente || "", reus: Array.isArray(p.reus) ? p.reus : [],
        banco: p.banco || null, fase: MAPA_FASE[p.fase] || p.fase || null, notas: p.notas || null, responsavel: pessoa(d, p.resp),
        ultima_data: dataOuNull(p.ultimaData), ultimo_ato: p.ultimoAto || null, cadastro_manual: !!p.cadastroManual,
      })));
      const nums = new Set((d.processos || []).map((p: Exp) => p.numero));
      // publicações: histórico (já triado) + caixa (pendente)
      const pubs = new Map<string, Exp>();
      for (const [n, lista] of Object.entries(d.historico || {})) for (const x of lista as Exp[]) pubs.set(x.id, { ...x, numero: n, triagem: "concluida" });
      for (const x of d.caixa || []) pubs.set(x.id, { ...pubs.get(x.id), ...x, triagem: "pendente" });
      add("publicacoes");
      await lotes("publicacoes", [...pubs.values()].filter((x) => /^\d+$/.test(String(x.id)) && nums.has(x.numero) && dataOuNull(x.data)).map((x) => ({
        id: Number(x.id), processo_numero: x.numero, data: dataOuNull(x.data), tipo_com: x.tipoCom || null, tipo_doc: x.tipoDoc || null,
        orgao: x.orgao || null, texto: x.texto || null, link: x.link || null, analise: x.analise || null, triagem: x.triagem,
      })), 100);
      const pubIds = new Set([...pubs.keys()]);
      // atendimentos (CRM pré-processual)
      const casoId: Record<string, string> = {};
      for (const c of d.casos || []) casoId[c.id] = await uuidDe("caso:" + c.id);
      add("casos");
      await lotes("casos", (d.casos || []).map((c: Exp) => ({
        id: casoId[c.id], cliente_id: c.clienteId ? cliId[c.clienteId] || null : null, nome: c.nome || "Sem nome", banco: c.banco || null,
        contratos: c.contratos || null, etapa: c.etapa || "Primeiro atendimento", responsavel: pessoa(d, c.resp), obs: c.obs || null,
        processo_numero: c.processoNumero && nums.has(c.processoNumero) ? c.processoNumero : null, criado_por: pessoa(d, c.criadoPor), criado_em: tsOuNull(c.criadoEm) || inicio,
      })));
      // tarefas
      const tarId: Record<string, string> = {};
      for (const t of d.prazos || []) tarId[t.id] = await uuidDe("tar:" + t.id);
      const tarefas = (d.prazos || []).filter((t: Exp) => (t.numero && nums.has(t.numero)) || (t.casoId && casoId[t.casoId])).map((t: Exp) => ({
        id: tarId[t.id], processo_numero: t.numero && nums.has(t.numero) ? t.numero : null, caso_id: t.casoId ? casoId[t.casoId] || null : null,
        publicacao_id: t.pubId && pubIds.has(t.pubId) && /^\d+$/.test(t.pubId) ? Number(t.pubId) : null,
        tipo: t.tipoTarefa || null, descricao: t.descricao || t.tipoTarefa || "Tarefa", vencimento: dataOuNull(t.vencimento), dias: t.dias || null,
        responsavel: pessoa(d, t.resp), revisor: pessoa(d, t.revisor), status: STATUS.has(t.status) ? t.status : "aberto",
        importante: !!t.importante, urgente: !!t.urgente, criado_por: pessoa(d, t.criadoPor), criado_em: tsOuNull(t.criadoEm) || inicio,
        feito_em: tsOuNull(t.feitoEm), feito_por: pessoa(d, t.feitoPor), enviado_em: tsOuNull(t.enviadoEm), devolvido_em: tsOuNull(t.devolvidoEm),
        aprovado_em: tsOuNull(t.aprovadoEm), aprovado_por: pessoa(d, t.aprovadoPor), protocolo_avisado_em: tsOuNull(t.protocoloAvisadoEm),
      }));
      add("tarefas");
      await lotes("tarefas", tarefas);
      await limparEventosDasTarefas(tarefas.map((t: Exp) => t.id), inicio);
      // linha do tempo original
      const TIPO_EV: Record<string, string> = { prazo: "tarefa_criada", cumprido: "tarefa_concluida", reaberto: "tarefa_reaberta", iniciada: "tarefa_iniciada", editada: "tarefa_editada",
        resp_prazo: "tarefa_atribuida", correcao_envio: "correcao_enviada", correcao_devolvida: "correcao_devolvida", correcao_aprovada: "correcao_aprovada",
        protocolo_avisado: "protocolo_avisado", cadastro: "processo_cadastrado", resp: "responsavel" };
      const evs: Record<string, unknown>[] = [];
      for (const [chave, lista] of Object.entries(d.eventos || {})) {
        const n = chave.startsWith("proc:") ? chave.slice(5) : null, cid = chave.startsWith("caso:") ? casoId[chave.slice(5)] : null;
        if (n && !nums.has(n)) continue; if (!n && !cid) continue;
        for (const e of lista as Exp[]) {
          const dadosEv: Exp = { ...e }; for (const k of ["id", "tipo", "em", "por", "prazoId", "pubId"]) delete dadosEv[k];
          if (e.tipo === "fase") dadosEv.fase = MAPA_FASE[e.texto] || e.texto;
          if (e.resp) dadosEv.responsavel = pessoa(d, e.resp);
          if (e.texto && !dadosEv.descricao) dadosEv.descricao = e.texto;
          evs.push({ processo_numero: n, caso_id: cid, tarefa_id: e.prazoId ? tarId[e.prazoId] || null : null,
            publicacao_id: e.pubId && pubIds.has(e.pubId) && /^\d+$/.test(e.pubId) ? Number(e.pubId) : null,
            tipo: TIPO_EV[e.tipo] || e.tipo, dados: dadosEv, por: pessoa(d, e.por), em: tsOuNull(e.em) || inicio });
        }
      }
      for (const n of nums) evs.push({ processo_numero: n, tipo: "importado", dados: {}, por: eu, em: inicio });
      if (!(await jaImportado())) { add("eventos"); await lotes("eventos", evs, 300); } else add("Linha do tempo já importada antes; mantida como estava.");
      // avisos ao cliente
      add("avisos_cliente");
      const avisos = [];
      for (const a of d.avisos || []) if (nums.has(a.numero)) avisos.push({
        id: await uuidDe("av:" + a.id), processo_numero: a.numero, publicacao_id: a.pubId && pubIds.has(a.pubId) && /^\d+$/.test(a.pubId) ? Number(a.pubId) : null,
        tipo_evento: a.tipoEvento || null, data_evento: dataOuNull(a.dataEvento), hora: /^\d\d:\d\d$/.test(a.hora || "") ? a.hora : null, local: a.local || null,
        orientacoes: a.orientacoes || null, mensagem: a.texto || null, status: a.status === "avisado" ? "avisado" : "pendente", canal: a.canal || null,
        aberto_em: tsOuNull(a.abertoEm), avisado_em: tsOuNull(a.avisadoEm), avisado_por: pessoa(d, a.avisadoPor), criado_por: pessoa(d, a.criadoPor), criado_em: tsOuNull(a.criadoEm) || inicio });
      await lotes("avisos_cliente", avisos);
      // chat
      const msgs = [];
      for (const m of d.mensagens || []) {
        const de = pessoa(d, m.de); if (!de) continue;
        let conversa = "geral";
        if (String(m.conv).startsWith("dm:")) { const ps = String(m.conv).slice(3).split("+").map((k) => pessoa(d, k)).filter(Boolean) as string[]; if (ps.length !== 2) continue; conversa = "dm:" + ps.sort().join(":"); }
        msgs.push({ id: await uuidDe("msg:" + m.id), conversa, de, texto: String(m.texto || "").slice(0, 4000) || "(vazio)", em: tsOuNull(m.em) || inicio });
      }
      add("mensagens"); await lotes("mensagens", msgs);
      // documentos (só quando veio o .zip com os arquivos)
      if (zip) {
        const sb = supabaseNavegador(); const docs: Record<string, unknown>[] = [];
        const lista = [...(d.clientes || []).flatMap((c: Exp) => (c.docs || []).map((x: Exp) => ({ ...x, cliente: cliId[c.id] }))),
          ...(d.prazos || []).flatMap((t: Exp) => (t.anexos || []).map((x: Exp) => ({ ...x, tarefa: tarId[t.id] })))];
        add(`documentos: 0 de ${lista.length}`);
        let k = 0;
        for (const x of lista) {
          k++; if (!x.arquivo || !zip.file(x.arquivo)) continue;
          const blob = await zip.file(x.arquivo)!.async("blob");
          const caminho = (x.cliente ? "clientes/" + x.cliente : "tarefas/" + x.tarefa) + "/" + (await uuidDe("doc:" + x.arquivo)).slice(0, 8) + "-" + String(x.nome || "arquivo").replace(/[^\w.\-]+/g, "_");
          const up = await sb.storage.from("documentos").upload(caminho, blob, { upsert: true, contentType: x.mime || undefined });
          if (up.error) throw new Error("Envio de " + x.nome + ": " + up.error.message);
          docs.push({ cliente_id: x.cliente || null, tarefa_id: x.tarefa || null, tipo: x.tipo || null, etapa: x.etapa || null, nome: x.nome || "arquivo", caminho, tamanho: blob.size, mime: x.mime || null, por: pessoa(d, x.por) || eu, em: tsOuNull(x.em) || inicio });
          setLog((l) => [...l.slice(0, -1), `documentos: ${k} de ${lista.length}`]);
        }
        await lotes("documentos", docs, 100);
      } else add("Sem .zip: os arquivos (RG, procurações, anexos) não foram trazidos.");
      add("Importação concluída.");
    } catch (e) { setErro(e instanceof Error ? e.message : "A importação parou."); }
    finally { setRodando(false); }
  }

  const cont = dados && { clientes: (dados.clientes || []).length, processos: (dados.processos || []).length, publicacoes: Object.values(dados.historico || {}).reduce((s: number, l) => s + (l as unknown[]).length, 0) + (dados.caixa || []).length, tarefas: (dados.prazos || []).length, atendimentos: (dados.casos || []).length, mensagens: (dados.mensagens || []).length };
  return (
    <section className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="f">Arquivo exportado do painel antigo (.zip com documentos, ou .json)
        <input type="file" accept=".zip,.json,application/json,application/zip" onChange={(e) => e.target.files?.[0] && abrir(e.target.files[0])} disabled={rodando} />
      </label>
      {erro && <div className="banner erro">{erro}</div>}
      {cont && <>
        <div className="banner ok">{Object.entries(cont).map(([k, v]) => `${v} ${k}`).join(" · ")}{zip ? " · com arquivos" : " · sem arquivos"}</div>
        <div><h3 style={{ marginBottom: 8 }}>Quem é quem</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Diga a qual pessoa do sistema novo corresponde cada pessoa do painel antigo. Quem ainda não foi convidado pode ficar sem correspondência; as tarefas dela ficam sem responsável.</div>
          <div className="form2">{pessoas(dados!).map((p) => (
            <label key={p.chave} className="f">{p.nome}
              <select value={mapa[p.chave] || ""} onChange={(e) => setMapa((m) => ({ ...m, [p.chave]: e.target.value }))}>
                <option value="">— sem correspondência —</option>{equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>))}
          </div></div>
        <div className="tools"><button className="btn primary" onClick={importar} disabled={rodando}>{rodando ? "Importando…" : "Importar agora"}</button></div>
      </>}
      {log.length > 0 && <pre className="mono" style={{ background: "var(--sunken)", padding: 12, borderRadius: 8, margin: 0, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>}
    </div></section>
  );
}
