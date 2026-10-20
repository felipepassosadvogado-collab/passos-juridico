// Busca das comunicações no DJEN (Diário de Justiça Eletrônico Nacional) pela OAB do escritório.
// Roda só no servidor, na região de São Paulo (gru1), porque o DJEN recusa acessos de fora do Brasil.
import type { SupabaseClient } from "@supabase/supabase-js";
import { bancoDosReus, nomeBonito, semAcento } from "./formato";
import { hojeBR, isoData, paraData, somaDias } from "./prazos";
import { analisarPublicacoes } from "./claude";
import { avisoDaAnalise } from "./regras";

export const OAB = { numero: "58547", uf: "SC" };
const BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ItemDjen = {
  id: number; data_disponibilizacao: string; siglaTribunal?: string; tipoComunicacao?: string; tipoDocumento?: string; nomeOrgao?: string;
  texto?: string; numero_processo: string; numeroprocessocommascara?: string; nomeClasse?: string; link?: string; ativo?: boolean;
  destinatarios?: { nome: string; polo: string }[];
};

export class ErroDjen extends Error {}

async function pagina(params: Record<string, string | number>): Promise<{ count: number; items: ItemDjen[] }> {
  const u = new URL(BASE); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  let r: Response | null = null, ultimoErro = "";
  for (let i = 0; i < 3; i++) {
    try {
      r = await fetch(u, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Passos Juridico; escritorio de advocacia)" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (r.ok) break;
      ultimoErro = "o DJEN respondeu " + r.status;
      if (r.status === 403) break;
    } catch (e) { ultimoErro = (e as Error).message || "sem resposta"; }
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
  if (!r || !r.ok) throw new ErroDjen(r?.status === 403 ? "o DJEN recusou o acesso do servidor (bloqueio por região)" : ultimoErro || "sem resposta do DJEN");
  const tipo = r.headers.get("content-type") || "";
  if (!tipo.includes("json")) throw new ErroDjen("o DJEN respondeu num formato inesperado");
  const j = await r.json();
  return { count: +j.count || 0, items: Array.isArray(j.items) ? j.items : [] };
}

/** texto da comunicação sem as marcas de HTML */
export function limparHtml(s?: string | null): string {
  if (!s) return "";
  if (!/<[a-z!]/i.test(s)) return s.trim();
  return s.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d|section|table|center)>/gi, "\n").replace(/<td[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/gi, " ")
    .replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const NAO_CLIENTE = /^sigilo$|\bbanco\b|\bs\.?\s?a\.?$|\bs\/a\b|ltda|financ|cr[eé]dito|seguro|previd|instituto nacional|uni[aã]o federal|munic[ií]pio|estado de|felipe dos passos silva|\beireli\b|\bme\b$/i;

/** comunicações de um processo (para preencher o cadastro manual) */
export async function buscarProcesso(numero: string) {
  const j = await pagina({ numeroProcesso: numero, itensPorPagina: 100, pagina: 1 });
  const its = j.items.filter((x) => x.ativo !== false).sort((a, b) => (a.data_disponibilizacao || "").localeCompare(b.data_disponibilizacao || ""));
  if (!its.length) return null;
  const ult = its[its.length - 1]; const A: string[] = [], P: string[] = [];
  for (const it of its) for (const d of it.destinatarios || []) { const l = d.polo === "A" ? A : P; if (!l.includes(d.nome)) l.push(d.nome); }
  return {
    orgao: ult.nomeOrgao || "", tribunal: ult.siglaTribunal || "", classe: ult.nomeClasse || "", autores: A, reus: P,
    pubs: its.map((it) => ({ id: +it.id, data: (it.data_disponibilizacao || "").slice(0, 10), tipo_com: it.tipoComunicacao || null, tipo_doc: it.tipoDocumento || null, orgao: it.nomeOrgao || null, texto: limparHtml(it.texto), link: it.link || null })),
  };
}

export type ResultadoSync = { novas: number; caixa: number; processosNovos: number; analisadas: number; paginas: number; erro?: string };

/** busca as comunicações novas pela OAB e grava processos, publicações e a caixa */
export async function sincronizarDjen(adm: SupabaseClient, origem: "automatica" | "manual", analisar = true): Promise<ResultadoSync> {
  const { data: cfg } = await adm.from("config").select("valor").eq("chave", "djen").maybeSingle();
  const meta: Record<string, any> = cfg?.valor || {};
  const salvarMeta = async (extra: Record<string, any>) => {
    await adm.from("config").upsert({ chave: "djen", valor: { ...meta, ...extra } }, { onConflict: "chave" });
  };
  const res: ResultadoSync = { novas: 0, caixa: 0, processosNovos: 0, analisadas: 0, paginas: 0 };
  try {
    // a partir de quando buscar: última data vista menos 5 dias (as publicações às vezes chegam atrasadas)
    let ultimaData: string = meta.ultimaData || "";
    if (!ultimaData) { const { data } = await adm.from("publicacoes").select("data").order("data", { ascending: false }).limit(1); ultimaData = data?.[0]?.data || ""; }
    const hoje = hojeBR();
    const desde = ultimaData ? isoData(somaDias(paraData(ultimaData), -5)) : isoData(somaDias(paraData(hoje), -60));
    const itens: ItemDjen[] = []; let total = 0; let comFiltro = true;
    for (let pag = 1; pag <= 80; pag++) {
      let j;
      const base = { numeroOab: OAB.numero, ufOab: OAB.uf, itensPorPagina: 100, pagina: pag };
      try { j = await pagina(comFiltro ? { ...base, dataDisponibilizacaoInicio: desde, dataDisponibilizacaoFim: hoje } : base); }
      catch (e) { if (comFiltro && pag === 1 && !/região|recusou/.test((e as Error).message)) { comFiltro = false; pag = 0; continue; } throw e; }
      res.paginas++; total = j.count; itens.push(...j.items);
      if (!j.items.length || itens.length >= total) break;
      // sem o filtro de data (ou se o DJEN o ignorar), para quando a página inteira já for anterior ao período
      if (j.items.every((x) => (x.data_disponibilizacao || "") < desde)) break;
      await new Promise((ok) => setTimeout(ok, 400));
    }
    // agrupa por processo e descarta o que já está gravado
    const ativos = itens.filter((x) => x.ativo !== false && /^\d{20}$/.test(x.numero_processo || "") && (x.data_disponibilizacao || "") >= desde);
    const ids = [...new Set(ativos.map((x) => +x.id))];
    const existentes = new Set<number>();
    for (let i = 0; i < ids.length; i += 300) { const { data } = await adm.from("publicacoes").select("id").in("id", ids.slice(i, i + 300)); for (const x of data || []) existentes.add(+x.id); }
    const grupos = new Map<string, ItemDjen[]>();
    for (const it of ativos) { if (existentes.has(+it.id)) continue; const l = grupos.get(it.numero_processo) || []; if (!l.some((y) => +y.id === +it.id)) l.push(it); grupos.set(it.numero_processo, l); }
    let maxData = ultimaData;
    const novasIds: number[] = [];
    const limiteAntigas = isoData(somaDias(paraData(hoje), -30));
    for (const [numero, its] of grupos) {
      its.sort((a, b) => (a.data_disponibilizacao || "").localeCompare(b.data_disponibilizacao || ""));
      const ult = its[its.length - 1];
      const { data: p0 } = await adm.from("processos").select("numero,reus,cliente_nome,cliente_id,ultima_data").eq("numero", numero).maybeSingle();
      const reus = [...(p0?.reus || [])]; let autores: string[] = [];
      for (const it of its) for (const d of it.destinatarios || []) { if (d.polo === "P" && !reus.includes(d.nome)) reus.push(d.nome); if (d.polo === "A" && !autores.includes(d.nome)) autores.push(d.nome); }
      autores = autores.map((x) => nomeBonito(x));
      const ultData = (ult.data_disponibilizacao || "").slice(0, 10);
      const ultimoAto = ult.tipoDocumento && ult.tipoDocumento !== "Outros" ? ult.tipoDocumento : ult.tipoComunicacao || "";
      if (!p0) {
        // processo novo na carteira: liga ao cliente pelo nome do primeiro autor, criando a ficha se preciso
        let clienteId: string | null = null; const autor = autores[0] || "";
        if (autor && !NAO_CLIENTE.test(autor)) {
          const { data: cs } = await adm.from("clientes").select("id,nome").ilike("nome", autor.replace(/[%_]/g, " "));
          const igual = (cs || []).find((c) => semAcento(c.nome) === semAcento(autor));
          if (igual) clienteId = igual.id;
          else { const { data: novo } = await adm.from("clientes").insert({ nome: autor, criado_por: null }).select("id").single(); clienteId = novo?.id || null; }
        }
        await adm.from("processos").insert({
          numero, tribunal: ult.siglaTribunal || null, orgao: ult.nomeOrgao || null, classe: ult.nomeClasse || null, cliente_id: clienteId,
          cliente_nome: autores.join(" / "), reus, banco: bancoDosReus(reus) || null, ultima_data: ultData || null, ultimo_ato: ultimoAto || null,
        });
        await adm.from("eventos").insert({ processo_numero: numero, tipo: "processo_cadastrado", dados: { texto: "Processo novo encontrado no DJEN." }, por: null });
        res.processosNovos++;
      } else {
        const upd: Record<string, any> = { reus, banco: bancoDosReus(reus) || null };
        if (!p0.cliente_nome && autores.length) upd.cliente_nome = autores.join(" / ");
        if (!p0.ultima_data || ultData >= p0.ultima_data) Object.assign(upd, { ultima_data: ultData || null, ultimo_ato: ultimoAto || null, orgao: ult.nomeOrgao || undefined, classe: ult.nomeClasse || undefined });
        for (const k of Object.keys(upd)) if (upd[k] === undefined) delete upd[k];
        await adm.from("processos").update(upd).eq("numero", numero);
      }
      const linhas = its.map((it) => {
        const data = (it.data_disponibilizacao || "").slice(0, 10); if (data > maxData) maxData = data;
        const caixa = data >= limiteAntigas && it.tipoComunicacao !== "Lista de distribuição";
        return { id: +it.id, processo_numero: numero, data, tipo_com: it.tipoComunicacao || null, tipo_doc: it.tipoDocumento || null, orgao: it.nomeOrgao || null,
          texto: limparHtml(it.texto).slice(0, 60000), link: it.link || null, triagem: caixa ? "pendente" : "concluida" };
      });
      const { error } = await adm.from("publicacoes").upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new ErroDjen("não consegui gravar as publicações: " + error.message);
      res.novas += linhas.length; res.caixa += linhas.filter((l) => l.triagem === "pendente").length;
      novasIds.push(...linhas.filter((l) => l.triagem === "pendente").map((l) => l.id));
    }
    await salvarMeta({ ultimaBusca: new Date().toISOString(), ultimaData: maxData, oab: OAB.numero + "/" + OAB.uf, totalPeriodo: total, ultimaQtd: res.caixa, origem, ultimoErro: null, ultimoErroEm: null });

    // análise automática das novas pelo Claude (se a chave estiver cadastrada e a opção ligada)
    const { data: geral } = await adm.from("config").select("valor").eq("chave", "geral").maybeSingle();
    if (analisar && novasIds.length && process.env.ANTHROPIC_API_KEY && geral?.valor?.analiseAutomatica !== false) {
      try { res.analisadas = await analisarPendentes(adm, novasIds.slice(0, 40)); } catch (e) { console.warn("análise automática", e); }
    }
    return res;
  } catch (e) {
    const msg = (e as Error).message || "falha desconhecida";
    await salvarMeta({ ultimoErro: msg, ultimoErroEm: new Date().toISOString() });
    return { ...res, erro: msg };
  }
}

/** analisa com o Claude as publicações indicadas que ainda não têm análise */
export async function analisarPendentes(adm: SupabaseClient, ids: number[]): Promise<number> {
  const { data: pubs } = await adm.from("publicacoes").select("id,processo_numero,data,tipo_doc,tipo_com,orgao,texto,analise").in("id", ids);
  const lista = (pubs || []).filter((p) => !p.analise);
  let n = 0;
  for (let i = 0; i < lista.length; i += 10) {
    const lote = lista.slice(i, i + 10);
    const r = await analisarPublicacoes(lote);
    for (const p of lote) {
      const an = r[String(p.id)]; if (!an) continue;
      await adm.from("publicacoes").update({ analise: an }).eq("id", p.id); n++;
      if (an.intimarCliente) {
        const { data: ja } = await adm.from("avisos_cliente").select("id").eq("publicacao_id", p.id).maybeSingle();
        if (!ja) await adm.from("avisos_cliente").insert({ processo_numero: p.processo_numero, publicacao_id: p.id, criado_por: null, ...avisoDaAnalise(an) });
      }
    }
  }
  return n;
}
