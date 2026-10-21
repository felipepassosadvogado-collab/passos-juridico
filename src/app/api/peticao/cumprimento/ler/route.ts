import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pedirJson, blocoArquivo, ErroClaude, MODELO_REDACAO } from "@/lib/claude";
import { encurtar } from "@/lib/encurtar";
import { dataBR, nomeBonito } from "@/lib/formato";
import type { Cliente, Processo, Publicacao } from "@/lib/tipos";

export const maxDuration = 300;

type Pedido = { numero: string; arquivos?: { caminho: string; mime: string }[]; textos?: { nome: string; paginas: number; semTexto: number[]; texto: string }[]; orientacoes?: string };
const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");

const INSTRUCOES = `Você é advogado do escritório Passos Advocacia (Felipe dos Passos Silva, OAB/SC 58.547, Joinville/SC), que representa a parte AUTORA (aposentados e pensionistas) em ações contra bancos e o INSS por empréstimos consignados não contratados, quase sempre no Juizado Especial Federal (eproc, TRF4). O processo já tem decisão definitiva e o escritório vai pedir o CUMPRIMENTO DE SENTENÇA.

Leia a cópia dos autos com atenção (sentença, embargos de declaração, acórdão da Turma Recursal, certidão de trânsito em julgado, extratos HISCRE/HISCON, laudo) e extraia EXATAMENTE o que o título executivo determinou — o que vale é o que ficou depois dos recursos (acórdão prevalece sobre a sentença no que a modificou). Não invente: se algo não estiver nos autos, use null e explique em "alertas".

Responda só com JSON, neste formato:
{
 "enderecamento": "AO JUÍZO DO JUIZADO ESPECIAL FEDERAL DA 2ª VARA FEDERAL DE JOINVILLE/SC" (o juízo de origem, onde se pede o cumprimento),
 "jef": true se tramita no Juizado Especial,
 "executado": nome do banco réu condenado, como no título (ex.: "Banco C6 Consignado S.A."),
 "inss": "subsidiaria" | "solidaria" | "nenhuma" (responsabilidade do INSS no título),
 "titulo": [parágrafos da seção "I – DO TÍTULO EXECUTIVO JUDICIAL", no estilo do escritório: o que a sentença decidiu (evento, juiz(a), data, fundamento — ex.: perícia grafotécnica, contrato e benefício), embargos, o acórdão (evento, Turma, data da sessão e da publicação, o que manteve e o que mudou, honorários), e por último um parágrafo dizendo que transitou em julgado (com a data/evento, se houver) e que o título é líquido, certo e exigível, restando promover o cumprimento na forma da memória de cálculo. Use **negrito** só para termos-chave como "simples" ou "em dobro". 3 a 5 parágrafos.],
 "transito": "AAAA-MM-DD" ou null,
 "restituicao": "simples" | "dobro" | "dobro_modulado" (dobro só após 30/03/2021, EAREsp 676.608) | "nenhuma",
 "contratos": [{"numero": "...", "parcela": número (valor da parcela descontada), "inicio": "AAAA-MM" (competência do 1º desconto), "fim": "AAAA-MM" (última competência descontada; se ainda desconta, null), "fonte": "onde está (ex.: HISCRE, Evento 14, ANEXO9)"}],
 "nb": "nº do benefício" ou null,
 "regime": "ipcae_selic" (IPCA-E + juros pela diferença SELIC − IPCA-E, art. 406 CC) | "manual_jf" (SELIC até 08/2024, depois IPCA + taxa legal / Manual de Cálculos da JF) | "lei" (IPCA + taxa legal, Lei 14.905/2024) | "ipcae1" (IPCA-E + 1% ao mês),
 "criterioTexto": transcrição curta do critério de correção e juros fixado no título,
 "jurosMateriais": "desconto" (desde cada desconto / evento danoso, Súmula 54) | "citacao",
 "citacao": "AAAA-MM" ou null (mês da citação, se os juros dos danos materiais correm da citação),
 "moral": {"valor": número, "jurosDesde": "AAAA-MM", "jurosMarco": "ex.: evento danoso — 1º desconto (Súmula 54/STJ)", "correcaoDesde": "AAAA-MM", "correcaoMarco": "ex.: sentença (Súmula 362/STJ)"} ou null,
 "compensacao": {"valor": número, "mes": "AAAA-MM", "texto": "o que o título disse"} ou null (só se o título MANDOU compensar/deduzir o valor creditado),
 "honorarios": {"tipo": "nenhum" | "percentual" | "fixo", "pct": número ou null, "base": "condenação" | "causa", "minimo": número ou null (piso em reais, ex.: 1 salário mínimo), "minimoDesde": "AAAA-MM" ou null (desde quando o piso é atualizado), "pisoTexto": "ex.: 1 (um) salário mínimo vigente na data do acórdão (27/08/2026)" ou null, "valor": número ou null (se fixo), "valorDesde": "AAAA-MM" ou null},
 "custas": "frase curta sobre custas e compensação para o item 'Custas e compensação' (ex.: não há custas por força do art. 55 da Lei 9.099/95; não há dedução do valor creditado porque o pedido de compensação não foi conhecido no evento X)",
 "oficiarInss": true se o título determinou ao INSS cessar os descontos/baixar a averbação,
 "alertas": [pontos que o advogado precisa conferir: dados que faltam, divergências, cálculo que depende de extrato atualizado, etc.]
}
Datas de competência em AAAA-MM. Valores como número com ponto decimal. Salário mínimo: 2024 = 1412; 2025 = 1518; 2026 = 1621.`;

/** lê a cópia integral do processo e extrai o título executivo e os parâmetros da liquidação */
export async function POST(req: Request) {
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
  if (!textos.length && !arquivos.length && !hist.length) return erro("Envie a cópia integral do processo (PDF).");
  const contexto = [
    `PROCESSO: ${p.mascara} · ${p.orgao || ""}${p.cidade ? " · " + p.cidade : ""} · ${p.classe || ""}`,
    `AUTOR(A): ${nomeBonito(cli?.nome || p.cliente_nome)}${cli?.nb ? " · NB " + cli.nb : ""}`, `RÉUS: ${(p.reus || []).join("; ")}`,
    p.notas ? `ANOTAÇÕES DO PROCESSO: ${p.notas}` : "",
    pd?.orientacoes?.trim() ? `ORIENTAÇÕES DO ADVOGADO: ${pd.orientacoes.trim()}` : "",
    textos.length ? `CÓPIA DOS AUTOS (texto extraído do PDF; fonte principal):\n\n${textos.join("\n\n")}` : "",
    arquivos.length ? `DOCUMENTOS ANEXADOS ACIMA: ${arquivos.length} arquivo(s).` : "",
    hist.length ? `PUBLICAÇÕES DO DJEN (complementares):\n${hist.join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const blocos = [];
    for (const a of arquivos) { const { data } = await adm.storage.from("documentos").download(a.caminho); if (data) blocos.push(blocoArquivo(a.mime, Buffer.from(await data.arrayBuffer()).toString("base64"))); }
    const dados = await pedirJson<Record<string, unknown>>([...blocos, { type: "text", text: INSTRUCOES + "\n\n" + contexto }], 12000, MODELO_REDACAO);
    return NextResponse.json({ dados });
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    console.warn("cumprimento ler", e); return erro("Não consegui ler o processo agora. Tente de novo.", 500);
  } finally {
    if (arquivos.length) await adm.storage.from("documentos").remove(arquivos.map((a) => a.caminho)).catch(() => {});
  }
}
