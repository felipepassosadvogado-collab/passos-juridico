// Conteúdo do roteiro de funções (sem estado): usado na caixa do sistema e na tela de entrada.
import { lerFuncoes, type Funcoes } from "@/lib/funcoes";

/** só o conteúdo (seções que abrem e fecham) — usado na caixa e na tela de entrada */
export function ConteudoFuncoes({ f, abertas = true }: { f: Funcoes; abertas?: boolean }) {
  return <div className="fn-corpo">{lerFuncoes(f.texto).map((b, i) => {
    const corpo = b.itens.map((it, j) => it.tipo === "destaque" ? <p key={j} className="fn-dest">{it.texto}</p> : it.tipo === "par" ? <p key={j}>{it.texto}</p> : null);
    const itens = b.itens.filter((it) => it.tipo === "item");
    const lista = itens.length ? <ul>{itens.map((it, j) => <li key={j}>{it.texto}</li>)}</ul> : null;
    return b.texto ? <details key={i} open={abertas}><summary>{b.texto}</summary>{corpo}{lista}</details> : <div key={i}>{corpo}{lista}</div>;
  })}</div>;
}

