// Formatação de nomes, documentos, datas e valores (pt-BR).

export const semAcento = (s?: string | null) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PEQUENAS = /^(da|de|do|das|dos|e)$/i;
const SIGLAS = /^(INSS|S\.?A\.?|S\/A|LTDA|BMG|PAN|BRB|CEF|EPP|ME|EIRELI|C6|OAB|CPF|CNPJ|RPV|JEF|TRF4|TJSC)$/i;

/** "BANCO C6 CONSIGNADO S.A." → "Banco C6 Consignado S.A." */
export function nomeBonito(s?: string | null): string {
  return (s || "").toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => {
    if (SIGLAS.test(w.replace(/[.,;]$/, "")) && !PEQUENAS.test(w)) return w.toUpperCase();
    if (i > 0 && PEQUENAS.test(w)) return w;
    return w.replace(/(^|[-'])\p{L}/gu, (c) => c.toUpperCase());
  }).join(" ").replace(/\bS\.A\.?$/, "S.A.");
}

export const iniciais = (s?: string | null) =>
  (s || "?").split(/\s+/).filter(Boolean).filter((w) => !PEQUENAS.test(w)).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export function mascaraCpf(s: string): string {
  const d = (s || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.replace(/(\d{3})(\d+)/, "$1.$2");
  if (d.length <= 9) return d.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, "$1.$2.$3-$4");
}
export function cpfValido(c?: string | null): boolean {
  const d = (c || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

/** WhatsApp no formato internacional (55 + DDD + número) */
export function foneWhatsapp(f?: string | null): string {
  let d = (f || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length <= 11) d = "55" + d;
  return d;
}

export const dataBR = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
export const dataHoraBR = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " " +
    d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
};

export const moeda = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function numeroBR(s?: string | number | null): number {
  if (typeof s === "number") return s;
  const t = String(s || "").replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  return parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0;
}

/** valor por extenso em reais */
export function porExtenso(v: number): string {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = (n: number) => {
    if (n === 100) return "cem";
    const p: string[] = []; const ce = Math.floor(n / 100), r = n % 100;
    if (ce) p.push(c[ce]);
    if (r) { if (r < 20) p.push(u[r]); else { const de = Math.floor(r / 10), un = r % 10; p.push(un ? `${d[de]} e ${u[un]}` : d[de]); } }
    return p.join(" e ");
  };
  const inteiro = (n: number) => {
    if (n === 0) return "zero";
    const mi = Math.floor(n / 1e6), mil = Math.floor(n / 1000) % 1000, r = n % 1000; const p: string[] = [];
    if (mi) p.push(mi === 1 ? "um milhão" : ate999(mi) + " milhões");
    if (mil) p.push(mil === 1 ? "mil" : ate999(mil) + " mil");
    if (r) p.push(p.length && (r < 100 || r % 100 === 0) ? "e " + ate999(r) : ate999(r));
    return p.join(" ");
  };
  const cents = Math.round(v * 100), re = Math.floor(cents / 100), ct = cents % 100; const partes: string[] = [];
  if (re) partes.push(inteiro(re) + (re === 1 ? " real" : re % 1e6 === 0 ? " de reais" : " reais"));
  if (ct) partes.push(ate999(ct) + (ct === 1 ? " centavo" : " centavos"));
  return partes.join(" e ") || "zero real";
}

/** idade em anos completos */
export function idade(nascimento?: string | null, hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })): number | null {
  if (!nascimento || !/^\d{4}-\d\d-\d\d$/.test(nascimento)) return null;
  const [ny, nm, nd] = nascimento.split("-").map(Number), [hy, hm, hd] = hoje.split("-").map(Number);
  let a = hy - ny; if (hm < nm || (hm === nm && hd < nd)) a--; return a;
}

const BANCOS_CURTOS = /C6|ITA[UÚ]|DAYCOVAL|BMG|BRADESCO|PAN|SANTANDER|MERCANTIL|AGIBANK|OLE|SAFRA|CREFISA|FACTA|CAIXA|BANRISUL|INTER|PICPAY|NUBANK|BANCO DO BRASIL|INSS/i;
export function bancoCurto(b?: string | null): string {
  if (!b) return "—";
  const m = b.match(BANCOS_CURTOS);
  return m ? m[0].toUpperCase() : b.split(" ").slice(0, 2).join(" ");
}
/** primeiro réu que não é o INSS */
export function bancoDosReus(reus: string[]): string {
  const r = reus.filter((x) => !/INSTITUTO NACIONAL DO SEGURO SOCIAL|^INSS/i.test(x));
  return r[0] || reus[0] || "";
}
