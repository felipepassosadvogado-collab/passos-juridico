"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = (d: string) => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const ITENS: [string, string, string][] = [
  ["/", "Painel", '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>'],
  ["/processos", "Processos", '<path d="M2.5 6V15a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5H4A1.5 1.5 0 0 0 2.5 6z"/>'],
  ["/clientes", "Clientes", '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/><circle cx="14" cy="7.5" r="2.2"/><path d="M14.5 12c1.6.3 2.7 1.5 3 3.5"/>'],
];
const ADMIN: [string, string, string][] = [
  ["/equipe", "Equipe", '<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>'],
  ["/importar", "Importar dados", '<path d="M10 3v10M6 9l4 4 4-4"/><path d="M3.5 14.5v2h13v-2"/>'],
];

export function Menu({ titular }: { titular: boolean }) {
  const p = usePathname();
  const ativo = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  const item = ([h, t, d]: [string, string, string]) => (
    <Link key={h} href={h} aria-current={ativo(h) ? "page" : undefined} title={t}>{I(d)}<span className="lbl">{t}</span></Link>
  );
  return (
    <nav className="rail" aria-label="Seções">
      {ITENS.map(item)}
      {titular && <><div className="sep" />{ADMIN.map(item)}</>}
    </nav>
  );
}

export function BotaoTema() {
  return (
    <button className="btn ghost" title="Alternar tema claro e escuro" onClick={() => {
      const c = document.documentElement.classList.toggle("claro");
      try { localStorage.setItem("tema", c ? "claro" : "escuro"); } catch { /* sem armazenamento */ }
    }}>{I('<path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/>')}</button>
  );
}
