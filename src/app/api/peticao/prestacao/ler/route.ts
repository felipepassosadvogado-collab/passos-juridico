import { medir } from "@/lib/operacao";
import { membroDaRota, erro, respostaLonga } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pedirJson, blocoArquivo, ErroClaude, MODELO_REDACAO } from "@/lib/claude";
import { encurtar } from "@/lib/encurtar";
import { dataBR, nomeBonito } from "@/lib/formato";
import type { Cliente, Processo, Publicacao } from "@/lib/tipos";

export const maxDuration = 300;

type Pedido = { numero: string; arquivos?: { caminho: string; mime: string }[]; textos?: { nome: string; paginas: number; semTexto: number[]; texto: string }[]; orientacoes?: string };
const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");

const INSTRUCOES = `Você auxilia o escritório Passos Advocacia (Felipe dos Passos Silva, OAB/SC 58.547), que representa a parte AUTORA (aposentados e pensionistas) em ações contra bancos e o INSS por empréstimo consignado não contratado. O processo já teve valores pagos e o advogado vai PRESTAR CONTAS ao cliente.

Leia os autos (alvarás, RPV/precatório, guias de depósito judicial, comprovantes de levantamento, sentença/acórdão, contrato de honorários se houver, extratos) e extraia SOMENTE o que estiver nos documentos:
- cada valor efetivamente pago/levantado no processo (alvará, RPV, depósito do banco, transferência para a conta do advogado ou do cliente), com data e se é honorário de SUCUMBÊNCIA (pago ao advogado) ou crédito do cliente;
- o valor do EMPRÉSTIMO que foi creditado na conta do cliente (o valor do contrato fraudulento depositado) ou que a sentença mandou compensar/devolver ao banco — isso entra no proveito econômico;
- o percentual de honorários contratuais, se houver contrato de honorários nos autos (senão null: o padrão do escritório é 30%);
- despesas do processo adiantadas pelo escritório (perícia, custas, diligências), se constarem.
Não some nem calcule nada: só transcreva os valores. Se um valor depende de documento que não está nos autos, diga em "alertas".

Responda só com JSON:
{
 "creditos": [{"descricao": "ex.: Alvará eletrônico — depósito do Banco C6 (evento 98)", "valor": número, "data": "AAAA-MM-DD" ou null, "sucumbencia": true se for honorário de sucumbência}],
 "emprestimo": {"valor": número ou 0, "descricao": "ex.: valor do contrato nº 0123 creditado na conta da autora em 12/05/2021, compensado na sentença"},
 "pct": número ou null,
 "despesas": [{"descricao": "...", "valor": número}],
 "sucumbenciaAReceber": número ou 0 (sucumbência fixada e ainda não paga),
 "resumo": "2 ou 3 frases sobre o desfecho do processo, para abrir a prestação de contas (ex.: sentença declarou nulo o contrato, condenou o banco a devolver em dobro e a pagar R$ 5.000,00 de danos morais; valores depositados e levantados)",
 "alertas": ["pontos a conferir"]
}
Valores como número com ponto decimal.`;

/** lê os autos e extrai o que foi pago, o empréstimo creditado/compensado e o % de honorários, para a prestação de contas */
async function tratar(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => null) as Pedido | null;
  const numero = String(pd?.numero || "").replace(/\D/g, "");
  if (numero.length !== 20) return erro("Processo inválido.");
  const adm = await supabaseAdmin();
  const { data: p } = await adm.from("processos").select("*").eq("numero", numero).maybeSingle<Processo>();
  if (!p) return erro("Processo não encontrado.", 404);
  const [{ data: cli }, { data: pubs }] = await Promise.all([
    p.cliente_id ? adm.from("clientes").select("*").eq("id", p.cliente_id).maybeSingle<Cliente>() : Promise.resolve({ data: null }),
    adm.from("publicacoes").select("id,data,tipo_com,tipo_doc,orgao,texto").eq("processo_numero", numero).order("data", { ascending: false }).limit(20),
  ]);
  let orc = 40000; const hist: string[] = [];
  for (const x of (pubs || []) as Publicacao[]) { const t = corte(x.texto, 4000); if (orc - t.length < 0) break; orc -= t.length; hist.push(`[${dataBR(x.data)} · ${x.tipo_doc || x.tipo_com || ""}] ${t}`); }
  hist.reverse();
  let resta = 450_000;
  const textos = (Array.isArray(pd?.textos) ? pd!.textos : []).slice(0, 4).map((x) => {
    const t = encurtar(String(x.texto || ""), Math.max(0, resta)); resta -= t.length;
    return `=== ${String(x.nome || "processo.pdf").slice(0, 120)} (${Number(x.paginas) || "?"} páginas) ===\n${t}`;
  }).filter((x) => x.length > 80);
  const arquivos = (pd?.arquivos || []).filter((a) => a.caminho?.startsWith(`leitura/${m.user.id}/`)).slice(0, 6);
  if (!textos.length && !arquivos.length && !hist.length) return erro("Envie os comprovantes (alvarás, RPV, depósitos) ou a cópia do processo (PDF).");
  const contexto = [
    `PROCESSO: ${p.mascara} · ${p.orgao || ""}${p.cidade ? " · " + p.cidade : ""} · ${p.classe || ""}`,
    `AUTOR(A): ${nomeBonito(cli?.nome || p.cliente_nome)}${cli?.nb ? " · NB " + cli.nb : ""}`, `RÉUS: ${(p.reus || []).join("; ")}`,
    p.notas ? `ANOTAÇÕES DO PROCESSO: ${p.notas}` : "",
    pd?.orientacoes?.trim() ? `ORIENTAÇÕES DO ADVOGADO: ${pd.orientacoes.trim()}` : "",
    textos.length ? `CÓPIA DOS AUTOS (texto extraído do PDF; fonte principal):\n\n${textos.join("\n\n")}` : "",
    arquivos.length ? `DOCUMENTOS ANEXADOS ACIMA: ${arquivos.length} arquivo(s).` : "",
    hist.length ? `PUBLICAÇÕES DO DJEN (complementares):\n${hist.join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return respostaLonga(async () => {
    try {
      const blocos = [];
      for (const a of arquivos) { const { data } = await adm.storage.from("documentos").download(a.caminho); if (data) blocos.push(blocoArquivo(a.mime, Buffer.from(await data.arrayBuffer()).toString("base64"))); }
      const dados = await pedirJson<Record<string, unknown>>([...blocos, { type: "text", text: INSTRUCOES + "\n\n" + contexto }], 6000, MODELO_REDACAO);
      return { corpo: { dados } };
    } catch (e) {
      if (e instanceof ErroClaude) return { corpo: { erro: e.message } };
      console.warn("prestacao ler", e); return { corpo: { erro: "Não consegui ler o processo agora. Tente de novo." } };
    } finally {
      if (arquivos.length) await adm.storage.from("documentos").remove(arquivos.map((a) => a.caminho)).catch(() => {});
    }
  }, "prestacao.ler");
}

/** registra duração e resultado no log (filtrar por "[operacao]" no painel da Vercel) */
export async function POST(req: Request) { return medir("prestacao.ler.pedido", () => tratar(req), {}, (r) => ({ status: r.status })); }
