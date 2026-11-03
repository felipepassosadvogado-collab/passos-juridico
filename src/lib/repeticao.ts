import { dataValida, isoData, paraData, pascoa, somaDias } from "./prazos";

/** datas de uma tarefa que se repete: todo dia útil (segunda a sexta, sem feriados nacionais), todos os dias ou toda semana */
const NACIONAIS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
export function datasRepeticao(inicio: string, ate: string, modo: "nao" | "util" | "todo" | "semana", max = 260): string[] {
  if (!dataValida(inicio)) return [];
  if (modo === "nao" || !dataValida(ate) || ate < inicio) return [inicio];
  const out: string[] = []; const sexta = (a: number) => isoData(somaDias(pascoa(a), -2));
  for (let d = paraData(inicio); isoData(d) <= ate && out.length < max; d = somaDias(d, modo === "semana" ? 7 : 1)) {
    const s = isoData(d), w = d.getUTCDay();
    if (modo === "util" && (w === 0 || w === 6 || NACIONAIS.includes(s.slice(5)) || s === sexta(d.getUTCFullYear()))) continue;
    out.push(s);
  }
  return out;
}

