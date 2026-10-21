import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { montarCumprimento, type DadosPeticaoCs } from "@/lib/cumprimentoDocx";
import type { ParamsCs, ResultadoCs } from "@/lib/cumprimento";
import { idade, nomeBonito } from "@/lib/formato";
import type { Cliente, Processo } from "@/lib/tipos";

export const maxDuration = 60;

type Pedido = Omit<DadosPeticaoCs, "autos" | "qualificacao" | "idoso" | "feminino"> & { numero: string; params: ParamsCs; r: ResultadoCs; feminino?: boolean };

/** gera a petição de cumprimento de sentença em Word, no modelo do escritório */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => null) as Pedido | null;
  const numero = String(pd?.numero || "").replace(/\D/g, "");
  if (!pd || numero.length !== 20 || !pd.params || !pd.r) return erro("Faça o cálculo antes de gerar a petição.");
  const { data: p } = await m.sb.from("processos").select("*").eq("numero", numero).maybeSingle<Processo>();
  if (!p) return erro("Processo não encontrado.", 404);
  const { data: cli } = p.cliente_id ? await m.sb.from("clientes").select("*").eq("id", p.cliente_id).maybeSingle<Cliente>() : { data: null as Cliente | null };
  const fem = pd.feminino ?? (/a$/i.test((cli?.estado_civil || "").trim()) || /a$/i.test((cli?.profissao || "").trim()));
  const a = fem ? "a" : "o";
  const resto = cli ? ", " + [(cli.nacionalidade || (fem ? "brasileira" : "brasileiro")).toLowerCase(), (cli.estado_civil || "").toLowerCase(), (cli.profissao || "").toLowerCase(),
    cli.cpf ? `inscrit${a} no CPF sob nº ${cli.cpf}` : "", cli.endereco ? `residente e domiciliad${a} na ${cli.endereco.replace(/^(na|no|em)\s+/i, "")}${cli.cep ? ", CEP " + cli.cep : ""}${cli.cidade ? ", no município de " + cli.cidade : ""}` : ""].filter(Boolean).join(", ") : "";
  const anos = idade(cli?.nascimento);
  try {
    const buf = await montarCumprimento({ ...pd, autos: `Autos nº ${p.mascara}`, qualificacao: { nome: nomeBonito(cli?.nome || p.cliente_nome), resto }, idoso: anos != null && anos >= 60, feminino: fem,
      titulo: (pd.titulo || []).map(String).slice(0, 12), custas: String(pd.custas || ""), fonteExtrato: String(pd.fonteExtrato || ""), nb: String(pd.nb || cli?.nb || "") });
    const nome = `Cumprimento_de_Sentenca_-_${nomeBonito(cli?.nome || p.cliente_nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_")}_${p.mascara}.docx`;
    await m.sb.from("eventos").insert({ processo_numero: p.numero, tipo: "comentario", dados: { texto: `Petição de cumprimento de sentença gerada (${nome}), valor exequendo R$ ${pd.r.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Revisar antes de protocolar.` }, por: m.user.id });
    return NextResponse.json({ nome, base64: buf.toString("base64") });
  } catch (e) { console.warn("cumprimento", e); return erro("Não consegui gerar a petição agora. Tente de novo.", 500); }
}
