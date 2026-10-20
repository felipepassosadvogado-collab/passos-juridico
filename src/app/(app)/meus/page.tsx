import { redirect } from "next/navigation";
// "Meus expedientes" foi unido ao Painel
export default async function Meus({ searchParams }: { searchParams: Promise<{ corrigir?: string }> }) {
  const { corrigir } = await searchParams;
  redirect(corrigir ? "/?corrigir=" + encodeURIComponent(corrigir) : "/");
}
