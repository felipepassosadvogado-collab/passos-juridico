import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** diagnóstico temporário: processos citados por tarefas e publicações que não aparecem para o usuário */
export async function GET() {
  const m = await membroDaRota(); if (!m || m.perfil.papel !== "titular") return erro("Só o titular.", 401);
  const adm = await supabaseAdmin();
  const [a, u, t, pub] = await Promise.all([
    adm.from("processos").select("numero", { count: "exact", head: true }),
    m.sb.from("processos").select("numero", { count: "exact", head: true }),
    adm.from("tarefas").select("id,processo_numero,descricao").not("processo_numero", "is", null),
    adm.from("publicacoes").select("id,processo_numero").eq("triagem", "pendente"),
  ]);
  const nums = [...new Set([...(t.data || []).map((x) => x.processo_numero), ...(pub.data || []).map((x) => x.processo_numero)])] as string[];
  const vistosAdm = new Set<string>(), vistosUsu = new Set<string>();
  for (let i = 0; i < nums.length; i += 100) {
    const lote = nums.slice(i, i + 100);
    const [x, y] = await Promise.all([adm.from("processos").select("numero").in("numero", lote), m.sb.from("processos").select("numero").in("numero", lote)]);
    (x.data || []).forEach((r) => vistosAdm.add(r.numero)); (y.data || []).forEach((r) => vistosUsu.add(r.numero));
  }
  const faltam = nums.filter((n) => !vistosUsu.has(n));
  const amostra = faltam.slice(0, 5);
  const det = [];
  for (const n of amostra) {
    const [x, y, z] = await Promise.all([
      adm.from("processos").select("*").eq("numero", n).maybeSingle(),
      m.sb.from("processos").select("*").eq("numero", n).maybeSingle(),
      adm.from("processos").select("numero").like("numero", n.trim().slice(0, 15) + "%"),
    ]);
    det.push({ numero: JSON.stringify(n), tamanho: n.length, admin: x.data ? "existe" : "não existe " + (x.error?.message || ""), usuario: y.data ? "vê" : "não vê " + (y.error?.message || ""), parecidos: (z.data || []).map((r) => JSON.stringify(r.numero)) });
  }
  return NextResponse.json({
    processos_no_banco: a.count, processos_que_voce_ve: u.count, erroUsuario: u.error?.message || null,
    tarefas: t.data?.length, publicacoes_na_caixa: pub.data?.length, citados: nums.length,
    citados_que_nao_existem: nums.filter((n) => !vistosAdm.has(n)).length, citados_que_voce_nao_ve: faltam.length, exemplos: det,
  });
}
