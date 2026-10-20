"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormNovoProcesso } from "@/components/novos";

function Novo() {
  const sp = useSearchParams(); const router = useRouter();
  return (
    <>
      <div className="head"><div><h2>Novo processo</h2></div></div>
      <section className="panel cx-pagina"><FormNovoProcesso ctx={{ clienteId: sp.get("cliente"), casoId: sp.get("caso") }} onCriado={(n) => router.replace("/processos/" + n)} onCaso={(id) => router.replace("/crm?caso=" + id)} /></section>
    </>
  );
}
export default function Pagina() { return <Suspense><Novo /></Suspense>; }
