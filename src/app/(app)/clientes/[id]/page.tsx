"use client";
import Link from "next/link";
import { use } from "react";
import { useDados } from "@/lib/dados";
import { FichaCliente } from "@/components/FichaCliente";

export default function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { clientes } = useDados();
  const c = clientes.get(id);
  if (!c) return <div className="empty"><strong>Cliente não encontrado.</strong><Link href="/clientes">Voltar aos clientes</Link></div>;
  return <FichaCliente key={c.id} c={c} />;
}
