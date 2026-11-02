"use client";
// Retorno visual das ações da pessoa, sem mudar nenhuma regra do sistema:
// observa os pedidos de gravação (POST/PATCH/DELETE…) que nascem logo depois de um clique ou Enter,
// mostra "Salvando…" enquanto estão no ar, marca o botão clicado como ocupado (impede o clique duplo)
// e libera tudo quando o servidor responde — com sucesso ou com erro (a mensagem de erro continua a mesma de antes).

export type Atividade = { pendentes: number; tipo: "salvar" | "arquivo" | "processar"; desde: number };
type Ouvinte = (a: Atividade) => void;

const ouvintes = new Set<Ouvinte>();
let instalado = false;
let gesto = 0; let alvo: HTMLElement | null = null;
const abertos = new Map<number, { tipo: Atividade["tipo"]; desde: number }>(); let seq = 0;

const estado = (): Atividade => {
  const l = [...abertos.values()];
  const tipo = l.some((x) => x.tipo === "arquivo") ? "arquivo" : l.some((x) => x.tipo === "processar") ? "processar" : "salvar";
  return { pendentes: l.length, tipo, desde: l.length ? Math.min(...l.map((x) => x.desde)) : 0 };
};
const avisar = () => { const e = estado(); ouvintes.forEach((f) => f(e)); };
export function ouvirAtividade(f: Ouvinte) { ouvintes.add(f); f(estado()); return () => { ouvintes.delete(f); }; }

const ocupar = (el: HTMLElement) => { const n = Number(el.dataset.ocupado || 0) + 1; el.dataset.ocupado = String(n); el.setAttribute("aria-busy", "true"); el.classList.add("ocupado"); };
const liberar = (el: HTMLElement) => { const n = Number(el.dataset.ocupado || 1) - 1; if (n > 0) { el.dataset.ocupado = String(n); return; } delete el.dataset.ocupado; el.removeAttribute("aria-busy"); el.classList.remove("ocupado"); };

export function instalarAtividade() {
  if (instalado || typeof window === "undefined") return; instalado = true;
  const marcar = (e: Event) => { gesto = Date.now(); const t = e.target as HTMLElement | null; alvo = t?.closest?.("button, [role=button], a, label.icb") as HTMLElement | null; };
  // clique duplo num botão ocupado não dispara a ação de novo
  const barrar = (e: Event) => { const t = (e.target as HTMLElement | null)?.closest?.(".ocupado[aria-busy=true]"); if (t) { e.preventDefault(); e.stopImmediatePropagation(); } };
  document.addEventListener("click", barrar, true);
  document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement)?.closest?.(".ocupado[aria-busy=true]")) barrar(e); }, true);
  document.addEventListener("click", marcar, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") marcar(e); }, true);

  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method || (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const daPessoa = metodo !== "GET" && metodo !== "HEAD" && Date.now() - gesto < 2000 && !/registrar_acesso|\/realtime\//.test(url);
    if (!daPessoa) return original(entrada, init);
    const id = ++seq; const tipo: Atividade["tipo"] = /\/storage\/v1\/object/.test(url) ? "arquivo" : /\/api\//.test(url) && !/\/rest\/v1\//.test(url) ? "processar" : "salvar";
    abertos.set(id, { tipo, desde: Date.now() });
    const el = alvo && alvo.isConnected ? alvo : null; if (el) ocupar(el);
    avisar();
    const p = original(entrada, init);
    p.finally(() => { abertos.delete(id); if (el) liberar(el); avisar(); }).catch(() => { /* o erro segue para quem chamou */ });
    return p;
  };
}
