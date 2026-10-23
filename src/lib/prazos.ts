// Contagem de prazos em dias úteis, com o calendário de cada justiça:
// - Justiça Federal (TRF4 / JEF): feriados nacionais + Lei 5.010/66 (quarta e quinta da Semana Santa, 11/08, 01/11, 08/12)
//   e recesso de 20/12 a 06/01, com os prazos suspensos até 20/01 (art. 220 do CPC);
// - Justiça Estadual (TJSC): feriados nacionais + dias sem expediente forense em SC (Carnaval, quinta-feira santa, Corpus Christi,
//   Dia do Servidor, 08/12) e o mesmo recesso / suspensão de 20/12 a 20/01.
// A Páscoa (e com ela Carnaval, Semana Santa e Corpus Christi) é calculada para qualquer ano.
// Suspensões por portaria, feriados municipais e indisponibilidade do sistema entram pela lista de Configurações.

export type Foro = "jf" | "tjsc";
export type Suspensao = { ini: string; fim?: string | null; foro: Foro | "todos"; descricao: string; cidade?: string | null };

export const paraData = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoData = (d: Date) => d.toISOString().slice(0, 10);
export const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export const dataValida = (s?: string | null) => !!s && /^20\d\d-\d\d-\d\d$/.test(s) && !isNaN(paraData(s).getTime());

/** domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cache = new Map<string, Map<string, string>>();
/** feriados de um ano para a justiça indicada: data → motivo */
export function feriadosDoAno(ano: number, foro: Foro): Map<string, string> {
  const k = ano + foro; if (cache.has(k)) return cache.get(k)!;
  const f = new Map<string, string>(); const p = pascoa(ano); const rel = (n: number) => isoData(somaDias(p, n));
  const fixo = (md: string, nome: string) => f.set(`${ano}-${md}`, nome);
  fixo("01-01", "Confraternização Universal"); fixo("04-21", "Tiradentes"); fixo("05-01", "Dia do Trabalho"); fixo("09-07", "Independência");
  fixo("10-12", "Nossa Senhora Aparecida"); fixo("11-02", "Finados"); fixo("11-15", "Proclamação da República"); fixo("11-20", "Consciência Negra");
  fixo("12-08", "Dia da Justiça"); fixo("12-25", "Natal");
  f.set(rel(-48), "Carnaval"); f.set(rel(-47), "Carnaval"); f.set(rel(-3), "Quinta-feira Santa"); f.set(rel(-2), "Sexta-feira Santa"); f.set(rel(60), "Corpus Christi");
  if (foro === "jf") { f.set(rel(-4), "Quarta-feira Santa (Lei 5.010/66)"); fixo("08-11", "Dia do Advogado / cursos jurídicos (Lei 5.010/66)"); fixo("11-01", "Todos os Santos (Lei 5.010/66)"); }
  else { fixo("10-28", "Dia do Servidor Público (sem expediente forense em SC)"); }
  cache.set(k, f); return f;
}

// suspensões cadastradas em Configurações (portarias, feriados municipais, sistema fora do ar)
let EXTRAS: Suspensao[] = [];
export function definirSuspensoes(l: Suspensao[] | null | undefined) { EXTRAS = (l || []).filter((x) => dataValida(x.ini)); }
export const suspensoes = () => EXTRAS;

/** por que o dia não é útil (ou null se é útil) */
export function motivoNaoUtil(d: Date, foro: Foro = "jf", cidade?: string | null): string | null {
  const w = d.getUTCDay(), m = d.getUTCMonth() + 1, dd = d.getUTCDate(), s = isoData(d);
  if (w === 0 || w === 6) return w === 0 ? "domingo" : "sábado";
  if ((m === 12 && dd >= 20) || (m === 1 && dd <= 20)) return "recesso / prazos suspensos (20/12 a 20/01, art. 220 do CPC)";
  const fer = feriadosDoAno(d.getUTCFullYear(), foro).get(s); if (fer) return fer;
  const cid = (cidade || "").toLowerCase();
  const ex = EXTRAS.find((x) => (x.foro === "todos" || x.foro === foro) && s >= x.ini && s <= (x.fim || x.ini) && (!x.cidade || !cid || cid.includes(x.cidade.toLowerCase())));
  return ex ? ex.descricao : null;
}
export const diaUtil = (d: Date, foro: Foro = "jf", cidade?: string | null) => !motivoNaoUtil(d, foro, cidade);
export function proximoDiaUtil(d: Date, foro: Foro = "jf", cidade?: string | null): Date { let x = somaDias(d, 1); while (!diaUtil(x, foro, cidade)) x = somaDias(x, 1); return x; }

/** cidade do juízo de um processo (para feriados municipais cadastrados) */
export const cidadeDoProcesso = (p: { cidade?: string | null; orgao?: string | null }) => p.cidade || (p.orgao || "").replace(/^.*\bde\s+/i, "").split("/")[0].trim() || null;

/** justiça pelo número CNJ (J = 4 federal, 8 estadual) ou pelo tribunal */
export function foroDe(numero?: string | null, tribunal?: string | null): Foro {
  const d = String(numero || "").replace(/\D/g, "");
  if (d.length === 20) return d[13] === "8" ? "tjsc" : "jf";
  return /^TJ/i.test(tribunal || "") ? "tjsc" : "jf";
}

/**
 * Vencimento a partir da disponibilização no DJEN.
 * eproc: ciência tácita no 10º dia corrido (prorrogada ao próximo dia útil) e o prazo corre do dia útil seguinte.
 * DJEN: publicada no 1º dia útil após a disponibilização e o prazo corre do dia útil seguinte.
 */
export function calcularVencimento(disponibilizacao: string, diasUteis: number, eproc: boolean, foro: Foro = "jf", cidade?: string | null): string {
  if (!dataValida(disponibilizacao) || !diasUteis || diasUteis < 1) return "";
  let base = paraData(disponibilizacao);
  if (eproc) { base = somaDias(base, 10); if (!diaUtil(base, foro, cidade)) base = proximoDiaUtil(base, foro, cidade); }
  else base = proximoDiaUtil(base, foro, cidade);
  let d = proximoDiaUtil(base, foro, cidade);
  for (let i = 1; i < diasUteis; i++) d = proximoDiaUtil(d, foro, cidade);
  return isoData(d);
}

/** os dias não úteis que caíram dentro de um prazo (para mostrar por que a data foi aquela) */
export function diasPulados(disponibilizacao: string, vencimento: string, foro: Foro = "jf", cidade?: string | null) {
  const out: { data: string; motivo: string }[] = [];
  if (!dataValida(disponibilizacao) || !dataValida(vencimento)) return out;
  for (let d = somaDias(paraData(disponibilizacao), 1); isoData(d) <= vencimento; d = somaDias(d, 1)) {
    const m = motivoNaoUtil(d, foro, cidade); if (m && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push({ data: isoData(d), motivo: m });
  }
  return out;
}

export function hojeBR(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
export const diferencaDias = (a: string, b: string) => Math.round((paraData(a).getTime() - paraData(b).getTime()) / 864e5);

export type Situacao = { cor: "" | "late" | "soon" | "ok"; texto: string };
export function situacaoPrazo(vencimento?: string | null, hoje = hojeBR()): Situacao {
  if (!vencimento) return { cor: "", texto: "sem prazo" };
  const k = diferencaDias(vencimento, hoje);
  if (k < 0) return { cor: "late", texto: k === -1 ? "venceu ontem" : `vencido há ${-k} dias` };
  if (k === 0) return { cor: "late", texto: "vence hoje" };
  if (k <= 3) return { cor: "soon", texto: k === 1 ? "vence amanhã" : `em ${k} dias` };
  return { cor: "", texto: `em ${k} dias` };
}
