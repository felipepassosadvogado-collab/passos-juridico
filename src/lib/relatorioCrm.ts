// Relatório de gestão do CRM: carteira de processos, honorários esperados, médias por fase/banco/responsável,
// amostra dos cumprimentos de sentença (valor já calculado) e quantos processos são precisos para atingir uma meta.
// Só calcula: quem desenha o PDF é relatorioCrmPdf.ts.
import { faseCRM } from "./regras";
import { foroDe } from "./prazos";
import { honorarios } from "./valores";
import { nomeBonito } from "./formato";
import type { Caso, Processo, Tarefa } from "./tipos";

export type PrecisaoData = "dia" | "aprox" | "ano";
export type Protocolo = { data: string; precisao: PrecisaoData; fonte: string };
export type PubMin = { processo_numero: string; data: string; tipo_com: string | null };
export type EventoMin = { processo_numero: string | null; caso_id: string | null; tipo: string; dados: Record<string, unknown>; em: string };

export type FiltrosCrm = {
  de: string; ate: string; // período do protocolo da inicial (AAAA-MM-DD); vazio = sem limite
  fases: string[]; // vazio = todas (exceto encerrados, a menos que incluídos)
  incluirEncerrados: boolean; banco: string; responsavel: string; justica: "" | "jf" | "tjsc";
};

export const ANDAMENTO = ["", "Protocolo / citação", "Réplica", "Perícia / instrução", "Sentença", "Recurso", "Petição nos próprios autos"];
export const CUMPRIMENTO = "Cumprimento de sentença";

const anoCnj = (n: string) => { const d = n.replace(/\D/g, ""); return d.length === 20 ? d.slice(9, 13) : ""; };
const dia = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "");

/**
 * Data do protocolo da inicial, da fonte mais segura para a menos:
 * tarefa "Protocolo da inicial" concluída → atendimento marcado "Protocolado" → cadastro manual do processo →
 * lista de distribuição no DJEN → 1ª publicação no mesmo ano do nº CNJ (aproximada) → só o ano do nº CNJ.
 */
export function datasDeProtocolo(processos: Processo[], tarefas: Tarefa[], casos: Caso[], pubs: PubMin[], eventos: EventoMin[]): Map<string, Protocolo> {
  const out = new Map<string, Protocolo>();
  const casoProc = new Map(casos.filter((c) => c.processo_numero).map((c) => [c.id, c.processo_numero!]));
  const porTarefa = new Map<string, string>();
  for (const t of tarefas) {
    if (!/protocolo da inicial/i.test(t.tipo || "") && !(/protocol/i.test(t.descricao) && /inicial/i.test(t.descricao))) continue;
    const quando = t.protocolo_avisado_em || (t.status === "feito" ? t.feito_em : null); if (!quando) continue;
    const n = t.processo_numero || (t.caso_id ? casoProc.get(t.caso_id) : null); if (!n) continue;
    const d = dia(quando); if (!porTarefa.has(n) || d < porTarefa.get(n)!) porTarefa.set(n, d);
  }
  const porCaso = new Map<string, string>();
  for (const e of eventos) {
    if (e.tipo !== "fase" || !e.caso_id || !/^Protocolado/i.test(String(e.dados?.fase || ""))) continue;
    const n = casoProc.get(e.caso_id); if (n && (!porCaso.has(n) || dia(e.em) < porCaso.get(n)!)) porCaso.set(n, dia(e.em));
  }
  const distrib = new Map<string, string>(), primeira = new Map<string, string>();
  for (const p of pubs) {
    const n = p.processo_numero; if (!n || !p.data) continue;
    if (/distribui/i.test(p.tipo_com || "") && (!distrib.has(n) || p.data < distrib.get(n)!)) distrib.set(n, p.data);
    if (!primeira.has(n) || p.data < primeira.get(n)!) primeira.set(n, p.data);
  }
  const ligadoACaso = new Set(casoProc.values());
  for (const p of processos) {
    const n = p.numero, ano = anoCnj(n);
    if (porTarefa.has(n)) out.set(n, { data: porTarefa.get(n)!, precisao: "dia", fonte: "tarefa de protocolo" });
    else if (porCaso.has(n)) out.set(n, { data: porCaso.get(n)!, precisao: "dia", fonte: "atendimento protocolado" });
    else if (p.cadastro_manual && ligadoACaso.has(n) && p.criado_em) out.set(n, { data: dia(p.criado_em), precisao: "dia", fonte: "cadastro do processo" });
    else if (distrib.has(n)) out.set(n, { data: distrib.get(n)!, precisao: "dia", fonte: "lista de distribuição (DJEN)" });
    else if (primeira.has(n) && primeira.get(n)!.slice(0, 4) === ano) out.set(n, { data: primeira.get(n)!, precisao: "aprox", fonte: "1ª publicação" });
    else if (ano) out.set(n, { data: ano + "-01-01", precisao: "ano", fonte: "ano do nº CNJ" });
  }
  return out;
}

/** o protocolo cai no período? data só com o ano conta quando o ano inteiro está dentro do período */
export function noPeriodo(pr: Protocolo | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true; if (!pr) return false;
  if (pr.precisao === "ano") { const a = pr.data.slice(0, 4); return (!de || de <= a + "-01-01") && (!ate || ate >= a + "-12-31"); }
  return (!de || pr.data >= de) && (!ate || pr.data <= ate);
}

export type Grupo = { nome: string; n: number; comValor: number; valor: number; hon: number; media: number; mediana: number; min: number; max: number };
const mediana = (l: number[]) => { if (!l.length) return 0; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function agrupar(nome: string, l: { valor: number; hon: number }[]): Grupo {
  const cv = l.filter((x) => x.valor > 0); const hs = cv.map((x) => x.hon);
  const valor = cv.reduce((s, x) => s + x.valor, 0), hon = hs.reduce((s, x) => s + x, 0);
  return { nome, n: l.length, comValor: cv.length, valor, hon, media: cv.length ? hon / cv.length : 0, mediana: mediana(hs), min: hs.length ? Math.min(...hs) : 0, max: hs.length ? Math.max(...hs) : 0 };
}

export type LinhaProc = { numero: string; mascara: string; cliente: string; banco: string; fase: string; responsavel: string; justica: "jf" | "tjsc"; protocolo: Protocolo | null; valor: number; pct: number; hon: number; calculado: boolean };
export type Pareado = { numero: string; cliente: string; de: number; para: number };
export type RelatorioCrm = {
  filtros: FiltrosCrm; pctPadrao: number; total: Grupo; andamento: Grupo; cumprimento: Grupo; encerrados: Grupo | null;
  porFase: Grupo[]; porBanco: Grupo[]; porResp: Grupo[]; porJustica: Grupo[]; faixas: { faixa: string; n: number; hon: number }[];
  protocolosMes: { mes: string; n: number; hon: number }[]; ritmoMensal: number; mesesRitmo: number;
  semData: { ano: number; aprox: number; nenhuma: number };
  cumpr: { calculados: number; pareados: Pareado[]; fatorRealizacao: number | null; tempoMedioMeses: number | null; amostraTempo: number };
  pre: { etapa: string; n: number; hon: number }[];
  linhas: LinhaProc[];
};

const MES = (d: string) => d.slice(0, 7);
const numBR = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function montarRelatorioCrm(o: {
  processos: Processo[]; casos: Caso[]; tarefas: Tarefa[]; pubs: PubMin[]; eventos: EventoMin[];
  filtros: FiltrosCrm; pctPadrao: number; nome: (id: string | null) => string; bancoCurto: (b: string | null) => string;
}): RelatorioCrm {
  const { filtros: F, pctPadrao } = o;
  const prot = datasDeProtocolo(o.processos, o.tarefas, o.casos, o.pubs, o.eventos);
  // cumprimentos cujo valor da causa veio do cálculo do sistema (amostra confiável) e o valor antes/depois
  const calc = new Map<string, { de: number | null; para: number }>();
  for (const e of o.eventos) {
    const t = String(e.dados?.texto || ""); if (!e.processo_numero || !/^Valor da causa atualizado pelo c[áa]lculo/i.test(t)) continue;
    const m = t.match(/de R\$ ([\d.,]+) para R\$ ([\d.,]+)/) || t.match(/para R\$ ([\d.,]+)/);
    calc.set(e.processo_numero, m && m.length === 3 ? { de: numBR(m[1]), para: numBR(m[2]) } : { de: null, para: m ? numBR(m[1]) : 0 });
  }
  const linhas: LinhaProc[] = o.processos.map((p) => {
    const fase = faseCRM(p.fase); const pct = p.honorarios_pct ?? pctPadrao; const valor = p.valor_causa || 0;
    return { numero: p.numero, mascara: p.mascara, cliente: nomeBonito(p.cliente_nome || ""), banco: o.bancoCurto(p.banco), fase, responsavel: o.nome(p.responsavel), justica: foroDe(p.numero, p.tribunal),
      protocolo: prot.get(p.numero) || null, valor, pct, hon: honorarios(valor, pct), calculado: calc.has(p.numero) };
  }).filter((l) => {
    const p = o.processos.find((x) => x.numero === l.numero)!;
    if (l.fase === "Encerrado" && !F.incluirEncerrados && !F.fases.includes("Encerrado")) return false;
    if (F.fases.length && !F.fases.includes(l.fase)) return false;
    if (F.banco && l.banco !== F.banco) return false;
    if (F.responsavel && p.responsavel !== F.responsavel) return false;
    if (F.justica && l.justica !== F.justica) return false;
    return noPeriodo(l.protocolo || undefined, F.de, F.ate);
  });
  const g = (nome: string, l: LinhaProc[]) => agrupar(nome, l);
  const ordem = ["", ...ANDAMENTO.slice(1), CUMPRIMENTO, "Encerrado"];
  const porFase = ordem.map((f) => g(f || "A classificar", linhas.filter((l) => (ordem.includes(l.fase) ? l.fase : "") === f))).filter((x) => x.n);
  const porChave = (k: (l: LinhaProc) => string) => [...new Set(linhas.map(k))].map((v) => g(v || "—", linhas.filter((l) => k(l) === v))).sort((a, b) => b.hon - a.hon);
  const cumprL = linhas.filter((l) => l.fase === CUMPRIMENTO); const andL = linhas.filter((l) => ANDAMENTO.includes(l.fase) || !ordem.includes(l.fase));
  const encL = linhas.filter((l) => l.fase === "Encerrado");
  const FX: [string, number, number][] = [["até R$ 2 mil", 0, 2000], ["R$ 2 a 5 mil", 2000, 5000], ["R$ 5 a 10 mil", 5000, 10000], ["R$ 10 a 20 mil", 10000, 20000], ["acima de R$ 20 mil", 20000, Infinity]];
  const faixas = FX.map(([faixa, a, b]) => { const l = linhas.filter((x) => x.valor > 0 && x.hon > a && x.hon <= b); return { faixa, n: l.length, hon: l.reduce((s, x) => s + x.hon, 0) }; });
  // protocolos por mês (só datas com dia, exatas ou aproximadas)
  const comDia = linhas.filter((l) => l.protocolo && l.protocolo.precisao !== "ano");
  const hoje = dia(new Date().toISOString());
  const ini = F.de || (() => { const d = new Date(); d.setMonth(d.getMonth() - 11); return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7) + "-01"; })();
  const fim = F.ate && F.ate < hoje ? F.ate : hoje;
  const meses: string[] = []; for (let m = MES(ini); m <= MES(fim) && meses.length < 60; ) { meses.push(m); const [a, mm] = m.split("-").map(Number); m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`; }
  const protocolosMes = meses.map((m) => { const l = comDia.filter((x) => MES(x.protocolo!.data) === m); return { mes: m, n: l.length, hon: l.reduce((s, x) => s + x.hon, 0) }; });
  // ritmo: média de protocolos por mês nos meses completos do intervalo (o mês corrente só entra se for o único)
  const completos = protocolosMes.length > 1 && MES(hoje) === protocolosMes[protocolosMes.length - 1].mes ? protocolosMes.slice(0, -1) : protocolosMes;
  const ritmoMensal = completos.length ? completos.reduce((s, x) => s + x.n, 0) / completos.length : 0;
  // fator de realização: quanto vale a condenação calculada em relação ao valor que estava na causa antes
  const pareados: Pareado[] = cumprL.filter((l) => calc.get(l.numero)?.de).map((l) => ({ numero: l.mascara, cliente: l.cliente, de: calc.get(l.numero)!.de!, para: calc.get(l.numero)!.para }));
  const sDe = pareados.reduce((s, x) => s + x.de, 0), sPara = pareados.reduce((s, x) => s + x.para, 0);
  // tempo do protocolo até entrar em cumprimento de sentença
  const entrada = new Map<string, string>();
  for (const e of o.eventos) if (e.tipo === "fase" && e.processo_numero && /^Cumprimento/i.test(String(e.dados?.fase || "")) && (!entrada.has(e.processo_numero) || e.em < entrada.get(e.processo_numero)!)) entrada.set(e.processo_numero, e.em);
  const tempos = cumprL.filter((l) => l.protocolo && l.protocolo.precisao !== "ano" && entrada.has(l.numero)).map((l) => (Date.parse(dia(entrada.get(l.numero))) - Date.parse(l.protocolo!.data)) / (864e5 * 30.44)).filter((x) => x > 0);
  const pre = ["", ...new Set(o.casos.filter((c) => !c.processo_numero).map((c) => c.etapa))].filter(Boolean).map((etapa) => {
    const l = o.casos.filter((c) => !c.processo_numero && c.etapa === etapa); return { etapa, n: l.length, hon: l.reduce((s, c) => s + honorarios(c.valor_causa, c.honorarios_pct ?? pctPadrao), 0) };
  });
  return {
    filtros: F, pctPadrao, total: g("Total", linhas), andamento: g("Em andamento", andL), cumprimento: g(CUMPRIMENTO, cumprL), encerrados: encL.length ? g("Encerrados", encL) : null,
    porFase, porBanco: porChave((l) => l.banco), porResp: porChave((l) => l.responsavel), porJustica: porChave((l) => (l.justica === "jf" ? "Justiça Federal" : "Justiça Estadual (TJSC)")),
    faixas, protocolosMes, ritmoMensal, mesesRitmo: completos.length,
    semData: { ano: linhas.filter((l) => l.protocolo?.precisao === "ano").length, aprox: linhas.filter((l) => l.protocolo?.precisao === "aprox").length, nenhuma: linhas.filter((l) => !l.protocolo).length },
    cumpr: { calculados: cumprL.filter((l) => l.calculado).length, pareados, fatorRealizacao: pareados.length && sDe ? sPara / sDe : null, tempoMedioMeses: tempos.length ? tempos.reduce((s, x) => s + x, 0) / tempos.length : null, amostraTempo: tempos.length },
    pre, linhas,
  };
}

/** quantos processos são precisos para chegar a uma meta de honorários, dada a média por processo e a taxa de êxito */
export const processosParaMeta = (meta: number, mediaHon: number, exito = 1) => (mediaHon > 0 && exito > 0 ? Math.ceil(meta / (mediaHon * exito)) : null);
