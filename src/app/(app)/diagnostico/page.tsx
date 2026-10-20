"use client";
import { useDados } from "@/lib/dados";

/** diagnóstico temporário: tarefas e publicações cujo processo não está nos dados da tela */
export default function Diagnostico() {
  const { processos, tarefas, caixa } = useDados();
  const chaves = [...processos.keys()];
  const faltaT = [...tarefas.values()].filter((t) => t.processo_numero && !processos.has(t.processo_numero));
  const faltaP = [...caixa.values()].filter((x) => !processos.has(x.processo_numero));
  const info = (n: string) => ({ valor: JSON.stringify(n), tipo: typeof n, tamanho: n.length, parecido: chaves.filter((k) => String(k).replace(/\D/g, "") === String(n).replace(/\D/g, "")).map((k) => JSON.stringify(k) + " " + typeof k) });
  return <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({
    processos_na_tela: processos.size, exemplo_chaves: chaves.slice(0, 3).map((k) => JSON.stringify(k) + " " + typeof k),
    tarefas: tarefas.size, tarefas_sem_processo: faltaT.map((t) => ({ tarefa: t.descricao.slice(0, 30), criada: t.criado_em, ...info(t.processo_numero!) })),
    caixa: caixa.size, caixa_sem_processo: faltaP.slice(0, 10).map((x) => ({ pub: x.id, ...info(x.processo_numero) })),
  }, null, 1)}</pre>;
}
