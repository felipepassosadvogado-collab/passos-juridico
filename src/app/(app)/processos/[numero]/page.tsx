"use client";
import { use, useEffect, useState } from "react";
import { PainelProcesso, type FocoProcesso } from "@/components/processo";

export default function FichaProcesso({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = use(params);
  // link com #pub-… ou #tar-… abre a aba certa e destaca o item
  const [foco, setFoco] = useState<FocoProcesso | null>(null);
  useEffect(() => { const h = window.location.hash.slice(1); setFoco(h.startsWith("pub-") ? { aba: "intimacoes", alvo: h } : h.startsWith("tar-") ? { aba: "tarefas", alvo: h } : {}); }, []);
  if (!foco) return null;
  return <PainelProcesso numero={numero} foco={foco} />;
}
