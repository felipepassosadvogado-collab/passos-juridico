// Contagem de prazos em dias úteis (Justiça Federal / JEF).
// Feriados nacionais e da Justiça Federal (Lei 5.010/66) e o recesso de 20/12 a 20/01.
// Feriados locais e suspensões por portaria não entram: a data sugerida deve ser conferida.

export const FERIADOS = new Set<string>([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-21", "2026-05-01",
  "2026-06-04", "2026-08-11", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-08", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-24", "2027-03-25", "2027-03-26", "2027-04-21", "2027-05-27",
  "2027-08-11", "2027-09-07", "2027-10-12", "2027-11-01", "2027-11-02", "2027-11-15", "2027-12-08",
  "2028-02-28", "2028-02-29", "2028-04-12", "2028-04-13", "2028-04-14", "2028-04-21", "2028-05-01", "2028-06-15",
  "2028-08-11", "2028-09-07", "2028-10-12", "2028-11-01", "2028-11-02", "2028-11-15", "2028-11-20", "2028-12-08", "2028-12-25",
]);

export const paraData = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoData = (d: Date) => d.toISOString().slice(0, 10);
export const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export const dataValida = (s?: string | null) => !!s && /^20\d\d-\d\d-\d\d$/.test(s) && !isNaN(paraData(s).getTime());

export function diaUtil(d: Date): boolean {
  const w = d.getUTCDay(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  if (w === 0 || w === 6) return false;
  if (FERIADOS.has(isoData(d))) return false;
  if ((m === 12 && dd >= 20) || (m === 1 && dd <= 20)) return false;
  return true;
}
export function proximoDiaUtil(d: Date): Date { let x = somaDias(d, 1); while (!diaUtil(x)) x = somaDias(x, 1); return x; }

/**
 * Vencimento a partir da disponibilização no DJEN.
 * eproc: ciência tácita no 10º dia corrido (prorrogada ao próximo dia útil) e o prazo corre do dia útil seguinte.
 * DJEN: publicada no 1º dia útil após a disponibilização e o prazo corre do dia útil seguinte.
 */
export function calcularVencimento(disponibilizacao: string, diasUteis: number, eproc: boolean): string {
  if (!dataValida(disponibilizacao) || !diasUteis || diasUteis < 1) return "";
  let base = paraData(disponibilizacao);
  if (eproc) { base = somaDias(base, 10); if (!diaUtil(base)) base = proximoDiaUtil(base); }
  else base = proximoDiaUtil(base);
  let d = proximoDiaUtil(base);
  for (let i = 1; i < diasUteis; i++) d = proximoDiaUtil(d);
  return isoData(d);
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
