// Aba Processos: filtro pela data de protocolo da inicial (semana, mês, ano, período) e o resumo do relatório
// de protocolos por cidade, vara e mês. A data do protocolo é a mesma do relatório do CRM (datasDeProtocolo).
import { cidadeDoProcesso, foroDe } from "./prazos";
import { noPeriodo, type Protocolo } from "./relatorioCrm";

export const PERIODOS = [
  ["", "Qualquer data de protocolo"], ["semana", "Protocolados nesta semana"], ["semana_passada", "Protocolados na semana passada"],
  ["mes", "Protocolados neste mês"], ["mes_passado", "Protocolados no mês passado"], ["ano", "Protocolados neste ano"], ["ano_passado", "Protocolados no ano passado"],
  ["periodo", "Escolher período…"],
] as const;
export type Periodo = (typeof PERIODOS)[number][0];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaUTC = (s: string) => new Date(s + "T12:00:00Z");

/** de/até (AAAA-MM-DD) do período, contado a partir de hoje; semana vai de segunda a domingo */
export function intervalo(p: string, hoje: string, de = "", ate = ""): { de: string; ate: string } {
  const h = diaUTC(hoje); const y = h.getUTCFullYear(), m = h.getUTCMonth();
  const seg = new Date(h); seg.setUTCDate(h.getUTCDate() - ((h.getUTCDay() + 6) % 7));
  const mais = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
  switch (p) {
    case "semana": return { de: iso(seg), ate: iso(mais(seg, 6)) };
    case "semana_passada": return { de: iso(mais(seg, -7)), ate: iso(mais(seg, -1)) };
    case "mes": return { de: iso(new Date(Date.UTC(y, m, 1))), ate: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "mes_passado": return { de: iso(new Date(Date.UTC(y, m - 1, 1))), ate: iso(new Date(Date.UTC(y, m, 0))) };
    case "ano": return { de: `${y}-01-01`, ate: `${y}-12-31` };
    case "ano_passado": return { de: `${y - 1}-01-01`, ate: `${y - 1}-12-31` };
    case "periodo": return { de, ate };
    default: return { de: "", ate: "" };
  }
}

/** a data entra no filtro? para semana e mês, a data só com o ano (nº CNJ) não basta */
export const protocoladoEm = (pr: Protocolo | undefined, de: string, ate: string) => noPeriodo(pr, de, ate);

export type ProcProt = { numero: string; mascara: string; cliente_nome: string; orgao: string | null; cidade?: string | null; banco: string | null; tribunal?: string | null; fase?: string | null };
export type LinhaProt = { numero: string; mascara: string; cliente: string; cidade: string; vara: string; justica: "Federal" | "Estadual"; banco: string; protocolo: Protocolo | null };
export type Contagem = { nome: string; n: number; detalhe?: { nome: string; n: number }[] };
export type ResumoProtocolos = { total: number; linhas: LinhaProt[]; porCidade: Contagem[]; porVara: Contagem[]; porMes: Contagem[]; porJustica: Contagem[]; aprox: number; soAno: number; semData: number };

const conta = (l: string[]) => { const m = new Map<string, number>(); for (const x of l) m.set(x, (m.get(x) || 0) + 1); return [...m].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)); };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (am: string) => MESES[+am.slice(5, 7) - 1] + "/" + am.slice(0, 4);

/** agrupa os processos filtrados por cidade (com as varas de cada uma), por vara, por mês do protocolo e por justiça */
const origemCnj = (n: string) => { const d = n.replace(/\D/g, ""); return d.length === 20 ? d.slice(13) : ""; }; // J + TR + OOOO (vara de origem)
const fora1Grau = (orgao: string | null) => /turma recursal|tribunal|\bTRF|\bTJ|c[aâ]mara|desembarg|recursos e incidentes/i.test(orgao || "");

/**
 * Cidade onde a ação foi protocolada: a do juízo; se o processo está na Turma Recursal/Tribunal, a da vara de origem,
 * aprendida dos outros processos com o mesmo código de origem no nº CNJ (ex.: …4.04.7201 = Joinville).
 */
export function cidadesDeOrigem(todos: ProcProt[]): (p: ProcProt) => string {
  const conta = new Map<string, Map<string, number>>();
  for (const p of todos) {
    const c = cidadeDoProcesso(p); const k = origemCnj(p.numero); if (!c || !k || fora1Grau(p.orgao) || /^[A-Z]{2}$/.test(c)) continue;
    const m = conta.get(k) || new Map<string, number>(); m.set(c, (m.get(c) || 0) + 1); conta.set(k, m);
  }
  const melhor = new Map([...conta].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  return (p) => {
    const c = cidadeDoProcesso(p);
    if (c && !fora1Grau(p.orgao) && !/^[A-Z]{2}$/.test(c)) return c;
    return melhor.get(origemCnj(p.numero)) || c || "Sem cidade";
  };
}

export function resumirProtocolos(procs: ProcProt[], prot: Map<string, Protocolo>, bancoCurto: (b: string | null) => string, nome: (s: string) => string, cidadeDe: (p: ProcProt) => string = cidadesDeOrigem(procs)): ResumoProtocolos {
  const linhas: LinhaProt[] = procs.map((p) => ({
    numero: p.numero, mascara: p.mascara, cliente: nome(p.cliente_nome || ""), cidade: cidadeDe(p), vara: (p.orgao || "Sem vara informada").trim(),
    justica: foroDe(p.numero, p.tribunal) === "tjsc" ? "Estadual" : "Federal", banco: bancoCurto(p.banco), protocolo: prot.get(p.numero) || null,
  }));
  const porCidade = conta(linhas.map((l) => l.cidade)).map((c) => ({ ...c, detalhe: conta(linhas.filter((l) => l.cidade === c.nome).map((l) => l.vara)) }));
  const comMes = linhas.filter((l) => l.protocolo && l.protocolo.precisao !== "ano");
  const porMes = conta(comMes.map((l) => l.protocolo!.data.slice(0, 7))).sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => ({ ...x, nome: nomeMes(x.nome) }));
  return { total: linhas.length, linhas, porCidade, porVara: conta(linhas.map((l) => l.vara)), porMes, porJustica: conta(linhas.map((l) => l.justica)),
    aprox: linhas.filter((l) => l.protocolo?.precisao === "aprox").length, soAno: linhas.filter((l) => l.protocolo?.precisao === "ano").length, semData: linhas.filter((l) => !l.protocolo).length };
}
