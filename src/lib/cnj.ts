// Número único de processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO

const UF_TJ = ["", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

export const soDigitos = (s?: string | null) => (s || "").replace(/\D/g, "");

export function mascaraCnj(s: string): string {
  const d = soDigitos(s).slice(0, 20);
  const partes = [7, 2, 4, 1, 2, 4], sep = ["-", ".", ".", ".", "."];
  let o = "", i = 0;
  for (let k = 0; k < partes.length && i < d.length; k++) { if (k) o += sep[k - 1]; o += d.slice(i, i + partes[k]); i += partes[k]; }
  return o;
}

/** dígito verificador (módulo 97, ISO 7064) */
export function cnjValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 20) return false;
  const n = d.slice(0, 7), dv = d.slice(7, 9), resto = d.slice(9);
  const r = BigInt(n + resto + "00") % 97n;
  return String(98n - r).padStart(2, "0") === dv;
}

export type InfoCnj = { ano: string; justica: string; tribunal: string; ramo: string; origem: string; chave: string };
export function infoCnj(s: string): InfoCnj | null {
  const d = soDigitos(s);
  if (d.length !== 20) return null;
  const j = d[13], tr = d.slice(14, 16), o = d.slice(16, 20), t = +tr;
  const tribunal = j === "4" ? "TRF" + t : j === "8" ? "TJ" + (UF_TJ[t] || tr) : j === "5" ? "TRT" + t : j === "6" ? "TRE-" + (UF_TJ[t] || tr) : j === "3" ? "STJ" : j === "1" ? "STF" : "";
  const ramo = ({ "1": "STF", "3": "STJ", "4": "Justiça Federal", "5": "Justiça do Trabalho", "6": "Justiça Eleitoral", "8": "Justiça Estadual" } as Record<string, string>)[j] || "";
  return { ano: d.slice(9, 13), justica: j, tribunal, ramo, origem: o, chave: `${j}.${tr}.${o}` };
}

/** cidade a partir do nome do juízo ("6ª Vara Federal de Joinville" → "Joinville") */
export function cidadeDoJuizo(orgao?: string | null): string {
  if (!orgao) return "";
  if (/Comarca da Capital/i.test(orgao)) return "Florianópolis";
  let m = orgao.match(/Comarca d[aeo]s?\s+(.+)$/i) || orgao.match(/(?:Federal|Trabalho) d[aeo]s?\s+(.+)$/i);
  if (!m) { const k = orgao.search(/\s(?:de|do|da)\s+(?!.*\s(?:de|do|da)\s)/i); if (k >= 0) m = ["", orgao.slice(k).replace(/^\s(?:de|do|da)\s+/i, "")] as unknown as RegExpMatchArray; }
  if (!m) return "";
  const c = m[1].replace(/\s+e Região.*$/i, "").trim();
  if (/direito|fazenda|fam[ií]lia|execu|acidente|sucess|banc[aá]rio|recursal|precat/i.test(c)) return "";
  return c === c.toUpperCase() ? c.toLowerCase().replace(/(^|\s)\p{L}/gu, (x) => x.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos)\b/g, (x) => x.toLowerCase()) : c;
}
