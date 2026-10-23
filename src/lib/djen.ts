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
  destinatarioadvogados?: { advogado?: { nome?: string; numero_oab?: string | number; uf_oab?: string } }[];
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

export type ResultadoSync = { novas: number; caixa: number; processosNovos: number; analisadas: number; paginas: number; erro?: string; avisos?: string[]; completa?: boolean };

/** variações de nome e OAB que a busca cobre (Configurações → DJEN pode acrescentar outras) */
export type Variacao = { tipo: "oab"; numero: string; uf?: string | null } | { tipo: "advogado" | "parte"; nome: string };
export const VARIACOES_PADRAO: Variacao[] = [
  { tipo: "oab", numero: OAB.numero, uf: OAB.uf },
  { tipo: "oab", numero: OAB.numero, uf: null }, // a mesma OAB sem a UF (cadastros com UF errada ou em branco)
  { tipo: "advogado", nome: "FELIPE DOS PASSOS SILVA" },
  { tipo: "advogado", nome: "FELIPE PASSOS SILVA" },
  { tipo: "advogado", nome: "FELIPE D. PASSOS SILVA" },
  { tipo: "parte", nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA" },
  { tipo: "advogado", nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA" },
  { tipo: "parte", nome: "PASSOS SOCIEDADE DE ADVOGADOS" },
];
export const rotuloVariacao = (v: Variacao) => v.tipo === "oab" ? `OAB ${v.numero}${v.uf ? "/" + v.uf : " (qualquer UF)"}` : `${v.tipo === "advogado" ? "advogado(a)" : "parte"}: ${v.nome}`;
const chaveNome = (s?: string | null) => semAcento(s || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w && !["DE", "DA", "DO", "DAS", "DOS", "E", "D"].includes(w)).join(" ");

/** a comunicação é mesmo nossa? (evita homônimos e consultas em que o DJEN ignore o filtro) */
export function ehNossa(it: ItemDjen, v: Variacao): boolean {
  const advs = (it.destinatarioadvogados || []).map((x) => x.advogado || {}) as { nome?: string; numero_oab?: string | number; uf_oab?: string }[];
  const oabNossa = advs.some((a) => String(a.numero_oab || "").replace(/\D/g, "") === OAB.numero);
  if (v.tipo === "oab") return !advs.length || advs.some((a) => String(a.numero_oab || "").replace(/\D/g, "") === v.numero.replace(/\D/g, ""));
  const k = chaveNome(v.nome); if (!k) return false;
  if (v.tipo === "advogado") {
    if (oabNossa) return true;
    const doNome = advs.filter((a) => chaveNome(a.nome) === k);
    if (doNome.length) return doNome.some((a) => !a.numero_oab || String(a.numero_oab).replace(/\D/g, "") === OAB.numero); // mesmo nome com outra OAB = homônimo
    return chaveNome(limparHtml(it.texto)).includes(k);
  }
  return oabNossa || (it.destinatarios || []).some((d) => chaveNome(d.nome) === k) || chaveNome(limparHtml(it.texto)).includes(k);
}

type Consulta = { termo: string; critica: boolean; count: number; baixadas: number; validas: number; ok: boolean; erro?: string };

/** baixa todas as páginas de uma variação no período e confere se veio tudo o que o DJEN disse que existe */
async function consultar(v: Variacao, desde: string, ate: string, itens: Map<number, ItemDjen>): Promise<Consulta> {
  const c: Consulta = { termo: rotuloVariacao(v), critica: v.tipo === "oab" && !!v.uf, count: 0, baixadas: 0, validas: 0, ok: false };
  const filtro: Record<string, string> = v.tipo === "oab" ? { numeroOab: v.numero, ...(v.uf ? { ufOab: v.uf } : {}) } : v.tipo === "advogado" ? { nomeAdvogado: v.nome } : { nomeParte: v.nome };
  const vistos = new Set<number>();
  try {
    for (let pag = 1; pag <= 100; pag++) {
      const j = await pagina({ ...filtro, dataDisponibilizacaoInicio: desde, dataDisponibilizacaoFim: ate, itensPorPagina: 100, pagina: pag });
      if (pag === 1) {
        c.count = j.count;
        // o DJEN devolvendo um volume absurdo para um nome = filtro ignorado: não serve, mas não pode passar em silêncio
        if (v.tipo !== "oab" && j.count > 3000) throw new ErroDjen(`o DJEN devolveu ${j.count} comunicações (o filtro por nome parece ter sido ignorado)`);
      }
      for (const it of j.items) {
        if (vistos.has(+it.id)) continue; vistos.add(+it.id); c.baixadas++;
        if (ehNossa(it, v)) { c.validas++; if (!itens.has(+it.id)) itens.set(+it.id, it); }
      }
      if (!j.items.length || vistos.size >= j.count) break;
      await new Promise((ok) => setTimeout(ok, 350));
    }
    if (c.baixadas < c.count) throw new ErroDjen(`paginação incompleta: o DJEN informou ${c.count} e vieram ${c.baixadas}`);
    c.ok = true;
  } catch (e) { c.erro = (e as Error).message || "falha"; }
  return c;
}

/** acha a ficha do cliente pelo nome do autor: igual (sem acento e sem de/da/dos); senão parecido, se houver um só */
export function acharCliente(autor: string, clientes: { id: string; nome: string; cpf: string | null }[]): { id: string | null; como: "igual" | "parecido" | "ambiguo" | "nenhum" } {
  const k = chaveNome(autor); if (!k) return { id: null, como: "nenhum" };
  const iguais = clientes.filter((c) => chaveNome(c.nome) === k);
  if (iguais.length === 1) return { id: iguais[0].id, como: "igual" };
  if (iguais.length > 1) { const comCpf = iguais.filter((c) => c.cpf); return comCpf.length === 1 ? { id: comCpf[0].id, como: "igual" } : { id: null, como: "ambiguo" }; }
  const t = k.split(" ");
  const parecidos = clientes.filter((c) => {
    const u = chaveNome(c.nome).split(" "); if (u.length < 2 || u[0] !== t[0]) return false;
    const comuns = u.filter((w) => t.includes(w)).length;
    const contido = (comuns === Math.min(u.length, t.length)) && comuns >= 3 && u[u.length - 1] === t[t.length - 1]; // pelo menos 3 nomes em comum: "João dos Santos" não vira "João Pedro dos Santos"
    // uma letra trocada (Cardoso/Cardozo, Hoepers/Hoeppers) com o mesmo número de nomes
    const quase = u.length === t.length && u.every((w, i) => w === t[i] || (Math.abs(w.length - t[i].length) <= 1 && w.slice(0, 3) === t[i].slice(0, 3)));
    return contido || quase;
  });
  if (parecidos.length === 1) return { id: parecidos[0].id, como: "parecido" };
  return { id: null, como: parecidos.length ? "ambiguo" : "nenhum" };
}

/** busca as comunicações novas por todas as variações de nome e OAB e grava processos, publicações e a caixa */
export async function sincronizarDjen(adm: SupabaseClient, origem: "automatica" | "manual", analisar = true, op: { desde?: string } = {}): Promise<ResultadoSync> {
  const t0 = Date.now();
  const { data: cfg } = await adm.from("config").select("valor").eq("chave", "djen").maybeSingle();
  const meta: Record<string, any> = cfg?.valor || {};
  const salvarMeta = async (extra: Record<string, any>) => {
    await adm.from("config").upsert({ chave: "djen", valor: { ...meta, ...extra } }, { onConflict: "chave" });
  };
  const res: ResultadoSync = { novas: 0, caixa: 0, processosNovos: 0, analisadas: 0, paginas: 0, avisos: [] };
  const hoje = hojeBR();
  // a partir de quando buscar: o último dia em que a busca foi COMPLETA, menos 7 dias (as publicações às vezes chegam atrasadas);
  // aos domingos (e quando pedido), uma varredura dos últimos 30 dias
  const domingo = paraData(hoje).getUTCDay() === 0;
  const ancora: string = meta.coberturaAte || meta.ultimaData || "";
  let desde = op.desde || (ancora ? isoData(somaDias(paraData(ancora), -7)) : isoData(somaDias(paraData(hoje), -60)));
  if (!op.desde && (domingo && origem === "automatica")) desde = isoData(somaDias(paraData(hoje), -30));
  if (desde > hoje) desde = hoje;
  const consultas: Consulta[] = [];
  const registrar = async (ok: boolean, completa: boolean, erro: string | null) => {
    const { error } = await adm.from("djen_execucoes").insert({ origem, ok, completa, desde, ate: hoje, consultas, itens: consultas.reduce((s, c) => s + c.validas, 0), novas: res.novas, caixa: res.caixa,
      processos_novos: res.processosNovos, erro, avisos: res.avisos || [], duracao_ms: Date.now() - t0 });
    if (error && !/djen_execucoes/.test(error.message)) console.warn("djen_execucoes", error.message);
  };
  try {
    const variacoes: Variacao[] = Array.isArray(meta.variacoes) && meta.variacoes.length ? meta.variacoes : VARIACOES_PADRAO;
    if (!variacoes.some((v) => v.tipo === "oab" && v.uf)) variacoes.unshift(VARIACOES_PADRAO[0]); // a OAB com UF nunca sai da busca
    const mapa = new Map<number, ItemDjen>();
    for (const v of variacoes) { const c = await consultar(v, desde, hoje, mapa); consultas.push(c); res.paginas += Math.ceil(Math.max(c.baixadas, 1) / 100); }
    const criticasFalharam = consultas.filter((c) => c.critica && !c.ok);
    for (const c of consultas.filter((x) => !x.ok && !x.critica)) res.avisos!.push(`${c.termo}: ${c.erro}`);
    for (const c of consultas.filter((x) => x.ok && x.validas < x.baixadas && !x.critica)) res.avisos!.push(`${c.termo}: ${c.baixadas - c.validas} comunicação(ões) de homônimo descartada(s)`);
    const completa = !criticasFalharam.length && consultas.every((c) => c.ok);

    // grava o que achou (mesmo numa busca incompleta: o que veio não se perde)
    const ativos = [...mapa.values()].filter((x) => x.ativo !== false && /^\d{20}$/.test(x.numero_processo || "") && (x.data_disponibilizacao || "") >= desde);
    const ids = ativos.map((x) => +x.id);
    const existentes = new Set<number>();
    for (let i = 0; i < ids.length; i += 300) { const { data } = await adm.from("publicacoes").select("id").in("id", ids.slice(i, i + 300)); for (const x of data || []) existentes.add(+x.id); }
    const grupos = new Map<string, ItemDjen[]>();
    for (const it of ativos) { if (existentes.has(+it.id)) continue; const l = grupos.get(it.numero_processo) || []; l.push(it); grupos.set(it.numero_processo, l); }
    let maxData: string = meta.ultimaData || "";
    const novasIds: number[] = [];
    const limiteAntigas = isoData(somaDias(paraData(hoje), -30));
    let clientes: { id: string; nome: string; cpf: string | null }[] | null = null;
    const carregarClientes = async () => { if (clientes) return clientes; const out: { id: string; nome: string; cpf: string | null }[] = []; for (let de = 0; ; de += 1000) { const { data } = await adm.from("clientes").select("id,nome,cpf").range(de, de + 999); out.push(...(data || [])); if (!data || data.length < 1000) break; } return (clientes = out); };
    const semFicha: string[] = [];
    for (const [numero, its] of grupos) {
      its.sort((a, b) => (a.data_disponibilizacao || "").localeCompare(b.data_disponibilizacao || ""));
      const ult = its[its.length - 1];
      const { data: p0 } = await adm.from("processos").select("numero,reus,cliente_nome,cliente_id,ultima_data").eq("numero", numero).maybeSingle();
      const reus = [...(p0?.reus || [])]; let autores: string[] = [];
      for (const it of its) for (const d of it.destinatarios || []) { if (d.polo === "P" && !reus.some((r) => chaveNome(r) === chaveNome(d.nome))) reus.push(d.nome); if (d.polo === "A" && !autores.includes(d.nome)) autores.push(d.nome); }
      autores = autores.map((x) => nomeBonito(x)).filter((x) => !NAO_CLIENTE.test(x));
      const ultData = (ult.data_disponibilizacao || "").slice(0, 10);
      const ultimoAto = ult.tipoDocumento && ult.tipoDocumento !== "Outros" ? ult.tipoDocumento : ult.tipoComunicacao || "";
      if (!p0 || !p0.cliente_id) {
        // liga ao cliente pelo nome do autor: ficha igual, ou parecida se houver uma só; nome ambíguo fica para a equipe decidir
        let clienteId: string | null = p0?.cliente_id || null; const autor = autores[0] || "";
        if (!clienteId && autor) {
          const achado = acharCliente(autor, await carregarClientes());
          if (achado.id) clienteId = achado.id;
          else if (achado.como === "nenhum") { const { data: novo } = await adm.from("clientes").insert({ nome: autor, criado_por: null }).select("id,nome,cpf").single(); if (novo) { clienteId = novo.id; (await carregarClientes()).push(novo); } }
          else semFicha.push(`${autor} (${numero})`);
          if (achado.como === "parecido" && p0) await adm.from("eventos").insert({ processo_numero: numero, tipo: "comentario", por: null, dados: { texto: `Processo ligado à ficha do cliente por nome parecido (no DJEN: ${autor}). Confira.` } });
        }
        if (!p0) {
          await adm.from("processos").insert({
            numero, tribunal: ult.siglaTribunal || null, orgao: ult.nomeOrgao || null, classe: ult.nomeClasse || null, cliente_id: clienteId,
            cliente_nome: autores.join(" / "), reus, banco: bancoDosReus(reus) || null, ultima_data: ultData || null, ultimo_ato: ultimoAto || null,
          });
          await adm.from("eventos").insert({ processo_numero: numero, tipo: "processo_cadastrado", dados: { texto: "Processo novo encontrado no DJEN." }, por: null });
          res.processosNovos++;
        } else if (clienteId) await adm.from("processos").update({ cliente_id: clienteId }).eq("numero", numero);
      }
      if (p0) {
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
    // avisa a equipe do que precisa de olho humano
    if (res.processosNovos || semFicha.length) {
      const { data: tit } = await adm.from("profiles").select("id").eq("papel", "titular").eq("ativo", true);
      const txt = [res.processosNovos ? `${res.processosNovos} processo(s) novo(s) encontrado(s) no DJEN` : "", semFicha.length ? `sem ficha certa (nome parecido com mais de um cliente): ${semFicha.slice(0, 5).join("; ")}` : ""].filter(Boolean).join(" · ");
      for (const t of tit || []) await adm.from("notificacoes").insert({ para: t.id, de: null, tipo: "djen", texto: txt.slice(0, 500) });
    }
    res.completa = completa;
    const erroCritico = criticasFalharam.length ? criticasFalharam.map((c) => `${c.termo}: ${c.erro}`).join("; ") : null;
    await salvarMeta({
      ultimaBusca: new Date().toISOString(), ultimaData: maxData, oab: OAB.numero + "/" + OAB.uf, ultimaQtd: res.caixa, origem,
      ...(completa ? { coberturaAte: hoje, ultimaCompleta: new Date().toISOString() } : {}),
      ultimoErro: erroCritico, ultimoErroEm: erroCritico ? new Date().toISOString() : null, ultimosAvisos: res.avisos,
    });
    await registrar(!erroCritico, completa, erroCritico);
    if (erroCritico) res.erro = erroCritico;

    // análise automática das novas pelo Claude (se a chave estiver cadastrada e a opção ligada)
    const { data: geral } = await adm.from("config").select("valor").eq("chave", "geral").maybeSingle();
    if (analisar && novasIds.length && process.env.ANTHROPIC_API_KEY && geral?.valor?.analiseAutomatica !== false) {
      try { res.analisadas = await analisarPendentes(adm, novasIds.slice(0, 40)); } catch (e) { console.warn("análise automática", e); }
    }
    return res;
  } catch (e) {
    const msg = (e as Error).message || "falha desconhecida";
    await salvarMeta({ ultimoErro: msg, ultimoErroEm: new Date().toISOString() });
    await registrar(false, false, msg);
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
