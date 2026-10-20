"use client";
import { useState } from "react";
import { useDados } from "@/lib/dados";

/** "Buscar no DJEN agora": a busca roda no servidor em São Paulo */
export function BotaoDjen({ rotulo = "Buscar no DJEN" }: { rotulo?: string }) {
  const { aviso, recarregar } = useDados(); const [ocupado, setOcupado] = useState(false);
  return (
    <button className="btn primary" disabled={ocupado} onClick={async () => {
      setOcupado(true);
      try {
        const r = await fetch("/api/djen/sincronizar", { method: "POST" }); const j = await r.json().catch(() => ({}));
        if (!r.ok) { aviso(j.erro || "A busca no DJEN falhou. Tente de novo em alguns minutos."); return; }
        await recarregar();
        aviso(j.caixa ? `${j.caixa} ${j.caixa === 1 ? "publicação nova na caixa" : "publicações novas na caixa"}${j.analisadas ? `, ${j.analisadas} já analisadas pelo Claude` : ""}.` : "Nenhuma publicação nova no DJEN.");
      } catch { aviso("A busca no DJEN falhou. Verifique a internet."); }
      finally { setOcupado(false); }
    }}>{ocupado ? "Buscando no DJEN…" : rotulo}</button>
  );
}
