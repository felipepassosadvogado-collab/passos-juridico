"use client";
// Valor da causa, percentual de honorários e o valor dos honorários (calculado).
import { useEffect, useState } from "react";
import { useDados } from "@/lib/dados";
import { moeda, numeroBR } from "@/lib/formato";
import { honorarios, pctPadrao } from "@/lib/valores";

export function CampoValores({ valor, pct, onSalvar, compacto }: { valor?: number | null; pct?: number | null; onSalvar: (c: { valor_causa: number | null; honorarios_pct: number | null }) => Promise<unknown> | void; compacto?: boolean }) {
  const { config } = useDados(); const padrao = pctPadrao(config);
  const [v, setV] = useState(valor ? moeda(valor) : ""); const [p, setP] = useState(pct != null ? String(pct).replace(".", ",") : "");
  useEffect(() => { setV(valor ? moeda(valor) : ""); }, [valor]);
  useEffect(() => { setP(pct != null ? String(pct).replace(".", ",") : ""); }, [pct]);
  const vn = numeroBR(v); const pn = p.trim() ? numeroBR(p) : padrao; const h = honorarios(vn, pn);
  const salvar = () => {
    const nv = v.trim() ? Math.round(numeroBR(v) * 100) / 100 : null; const np = p.trim() ? Math.min(100, Math.max(0, numeroBR(p))) : null;
    if (nv === (valor ?? null) && np === (pct ?? null)) return; onSalvar({ valor_causa: nv, honorarios_pct: np });
  };
  return (
    <div className={"valores-cx" + (compacto ? " compacto" : "")}>
      <label className="f">Valor da causa (R$)<input inputMode="decimal" value={v} placeholder="vem da petição inicial ou digite" onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim()) setV(moeda(numeroBR(v))); salvar(); }} /></label>
      <label className="f">Honorários contratuais (%)<input inputMode="decimal" value={p} placeholder={`${padrao} (padrão do escritório)`} onChange={(e) => setP(e.target.value)} onBlur={salvar} /></label>
      <div className="valores-hon"><span className="muted">Honorários{p.trim() ? "" : ` (${padrao}%)`}</span><strong>{h ? "R$ " + moeda(h) : "—"}</strong></div>
    </div>
  );
}
