// Último aviso ao cliente de cada processo (aba Processos): o último enviado; se não houver, o pendente mais recente.
import type { Aviso } from "./tipos";

export type UltimoAviso = { av: Aviso; situacao: "avisado" | "pendente" | "dispensado"; data: string };

export function ultimosAvisos(avisos: Iterable<Aviso>): Map<string, UltimoAviso> {
  const m = new Map<string, UltimoAviso>();
  const peso = { avisado: 3, dispensado: 2, pendente: 1 } as const;
  for (const av of avisos) {
    const data = (av.status === "avisado" ? av.avisado_em : null) || av.criado_em || "";
    const atual = m.get(av.processo_numero);
    const novo: UltimoAviso = { av, situacao: av.status, data };
    // vale o enviado mais recente; pendente só aparece se nunca houve aviso enviado
    if (!atual || (peso[novo.situacao] > peso[atual.situacao] && (atual.situacao !== "avisado")) || (novo.situacao === atual.situacao && data > atual.data)
      || (novo.situacao === "avisado" && atual.situacao === "avisado" && data > atual.data)) m.set(av.processo_numero, novo);
  }
  return m;
}
