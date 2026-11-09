"use client";
// Se uma página quebrar, o erro fica nela (com "Tentar de novo"); o menu e o resto do sistema continuam funcionando.
import { useEffect } from "react";

export default function ErroPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[pagina] erro:", error); }, [error]);
  return (
    <div className="panel" role="alert" style={{ padding: 24, maxWidth: 560, margin: "40px auto" }}>
      <h3 style={{ marginTop: 0 }}>Esta página teve um problema</h3>
      <p className="muted">Nada foi perdido. Clique em “Tentar de novo”; se continuar, recarregue a página. Detalhe técnico: {error.message || "erro desconhecido"}</p>
      <div className="tools"><button className="btn primary" onClick={reset}>Tentar de novo</button><button className="btn ghost" onClick={() => location.reload()}>Recarregar a página</button></div>
    </div>
  );
}
