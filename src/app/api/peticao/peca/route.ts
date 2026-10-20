import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pedirJson, blocoArquivo, ErroClaude, MODELO_REDACAO } from "@/lib/claude";
import { INSTRUCOES_PECA, montarDocx, type Peca } from "@/lib/peca";
import { encurtar } from "@/lib/encurtar";
import { dataBR, idade, nomeBonito } from "@/lib/formato";
import type { Cliente, Processo, Publicacao, Tarefa } from "@/lib/tipos";

export const maxDuration = 300;

type Pedido = { numero: string; publicacaoId?: number | null; tarefaId?: string | null; tipo: string; orientacoes?: string; arquivos?: { caminho: string; mime: string }[]; textos?: { nome: string; paginas: number; semTexto: number[]; texto: string }[] };
const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");

/** redige a peça com o Claude e devolve o Word no papel timbrado do escritório */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => null) as Pedido | null;
  if (!pd?.numero || !pd.tipo?.trim()) return erro("Escolha o tipo de peça.");
  // o acesso já foi conferido acima; a leitura usa o cliente do servidor para não depender de cache do navegador
  const adm = await supabaseAdmin();
  const numero = String(pd.numero).replace(/\D/g, "");
  let { data: p, error: e1 } = await adm.from("processos").select("*").eq("numero", numero).maybeSingle<Processo>();
  if (!p && pd.publicacaoId) {
    const { data: pubAlvo } = await adm.from("publicacoes").select("processo_numero").eq("id", pd.publicacaoId).maybeSingle();
    if (pubAlvo) ({ data: p, error: e1 } = await adm.from("processos").select("*").eq("numero", String(pubAlvo.processo_numero).trim()).maybeSingle<Processo>());
  }
  if (!p) { console.warn("peça: processo", numero, e1); return erro(`Processo ${numero} não encontrado${e1 ? " (" + e1.message + ")" : ""}.`, 404); }
  const [{ data: cli }, { data: pubs }, { data: ts }, { data: coms }, { data: perfis }] = await Promise.all([
    p.cliente_id ? adm.from("clientes").select("*").eq("id", p.cliente_id).maybeSingle<Cliente>() : Promise.resolve({ data: null }),
    adm.from("publicacoes").select("id,data,tipo_com,tipo_doc,orgao,texto,analise").eq("processo_numero", p.numero).order("data", { ascending: false }).limit(25),
    adm.from("tarefas").select("*").eq("processo_numero", p.numero),
    adm.from("eventos").select("dados,por,em").eq("processo_numero", p.numero).eq("tipo", "comentario").order("em", { ascending: false }).limit(12),
    adm.from("profiles").select("id,nome"),
  ]);
  const nomeDe = (id?: string | null) => (perfis || []).find((x) => x.id === id)?.nome || "equipe";
  const lista = (pubs || []) as Publicacao[];
  const alvo = pd.publicacaoId ? lista.find((x) => x.id === pd.publicacaoId) : undefined;
  const tarefa = ((ts || []) as Tarefa[]).find((t) => pd.tarefaId && t.id === pd.tarefaId) || ((ts || []) as Tarefa[]).find((t) => pd.publicacaoId && t.publicacao_id === pd.publicacaoId);
  const anotacoes = ((coms || []) as { dados: { texto?: string }; por: string; em: string }[])
    .filter((c) => c.dados?.texto && !/^Minuta gerada pelo Claude|^Petição inicial gerada/.test(c.dados.texto)).reverse()
    .map((c) => `- ${dataBR(c.em.slice(0, 10))}, ${nomeDe(c.por)}: ${corte(c.dados.texto, 800)}`);
  const an = alvo?.analise as Record<string, unknown> | null | undefined;
  const anos = idade(cli?.nascimento); const prioridade = anos != null && anos >= 60;
  const fem = /a$/i.test((cli?.estado_civil || "").trim()) || /a$/i.test((cli?.profissao || "").trim());
  // publicações em ordem cronológica, com limite de texto
  let orcamento = 45000; const historico: string[] = [];
  for (const x of lista) { if (x.id === alvo?.id) continue; const t = corte(x.texto, 3500); if (orcamento - t.length < 0) break; orcamento -= t.length; historico.push(`[${dataBR(x.data)} · ${x.tipo_doc || x.tipo_com || "Publicação"}] ${t}`); }
  historico.reverse();
  // texto da cópia integral extraído no navegador (limite total para caber no Claude)
  let resta = 450_000;
  const textosPdf = (Array.isArray(pd.textos) ? pd.textos : []).slice(0, 4).map((x) => {
    const t = encurtar(String(x.texto || ""), Math.max(0, resta)); resta -= t.length;
    const sem = Array.isArray(x.semTexto) && x.semTexto.length ? ` Páginas só com imagem, não lidas: ${x.semTexto.slice(0, 40).join(", ")}${x.semTexto.length > 40 ? "…" : ""}.` : "";
    return `=== ${String(x.nome || "processo.pdf").slice(0, 120)} (${Number(x.paginas) || "?"} páginas).${sem} ===\n${t}`;
  }).filter((x) => x.length > 80);
  const contexto = [
    `PEÇA PEDIDA: ${pd.tipo}`,
    pd.orientacoes?.trim() ? `ORIENTAÇÕES DO ADVOGADO: ${pd.orientacoes.trim()}` : "",
    `PROCESSO: ${p.mascara} · ${p.orgao || "juízo não informado"}${p.cidade ? " · " + p.cidade : ""} · ${p.classe || ""}`,
    `AUTOR(A): ${nomeBonito(cli?.nome || p.cliente_nome)}${fem ? " (gênero feminino: use “qualificada”, “a autora”)" : ""}${anos != null ? ` · ${anos} anos` : ""}${cli?.nb ? ` · benefício NB ${cli.nb}` : ""}`,
    `RÉUS: ${(p.reus || []).join("; ")}`,
    p.fase ? `FASE: ${p.fase}` : "",
    tarefa ? `TAREFA (criada por ${nomeDe(tarefa.criado_por)} para ${nomeDe(tarefa.responsavel)}): ${tarefa.descricao}` : "",
    tarefa ? `PRAZO: ${tarefa.dias ? tarefa.dias + " dias úteis, " : ""}vence em ${dataBR(tarefa.vencimento)}` : "",
    tarefa?.nota_correcao ? `RECADO DA CORREÇÃO: ${tarefa.nota_correcao}` : "",
    p.notas ? `ANOTAÇÕES FIXAS DO PROCESSO: ${p.notas}` : "",
    anotacoes.length ? `ANOTAÇÕES DA EQUIPE NA LINHA DO TEMPO (instruções a seguir, quando houver):\n${anotacoes.join("\n")}` : "",
    an ? `ANÁLISE DO CLAUDE SOBRE A PUBLICAÇÃO: ${[an.ato, an.resumo, an.providencia, an.obs].filter(Boolean).join(" · ")}` : "",
    alvo ? `PUBLICAÇÃO QUE GEROU A PEÇA (${dataBR(alvo.data)} · ${alvo.tipo_doc || alvo.tipo_com || ""}):\n${corte(alvo.texto, 12000)}` : "",
    historico.length ? `OUTRAS PUBLICAÇÕES DO PROCESSO (da mais antiga para a mais recente):\n${historico.join("\n\n")}` : "",
    textosPdf.length ? `CÓPIA DOS AUTOS (texto extraído de PDF; é a fonte principal dos fatos — localize nela o ato que a peça enfrenta, como laudo, sentença, contestação ou decisão, e cite número de evento e página quando aparecerem):\n\n${textosPdf.join("\n\n")}` : "",
    pd.arquivos?.length ? `DOCUMENTOS ENVIADOS PELO ADVOGADO: ${pd.arquivos.length} arquivo(s) anexados acima (ex.: laudo, sentença, contestação). Use-os como fonte principal dos fatos.` : "",
  ].filter(Boolean).join("\n\n");

  const arquivos = (pd.arquivos || []).filter((a) => a.caminho?.startsWith(`leitura/${m.user.id}/`)).slice(0, 6);
  try {
    const blocos = [];
    for (const a of arquivos) {
      const { data } = await adm.storage.from("documentos").download(a.caminho);
      if (data) blocos.push(blocoArquivo(a.mime, Buffer.from(await data.arrayBuffer()).toString("base64")));
    }
    const peca = await pedirJson<Peca>([...blocos, { type: "text", text: INSTRUCOES_PECA + "\n\n" + contexto }], 16000, MODELO_REDACAO);
    if (!peca?.titulo || !Array.isArray(peca.blocos)) return erro("A peça veio incompleta. Tente de novo.", 502);
    const buf = await montarDocx(peca, `Autos nº ${p.mascara}`, prioridade);
    const nome = (peca.nomeArquivo || `${pd.tipo}_-_${nomeBonito(cli?.nome || p.cliente_nome)}`).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").slice(0, 110) + ".docx";
    await m.sb.from("eventos").insert({ processo_numero: p.numero, publicacao_id: alvo?.id ?? null, tarefa_id: tarefa?.id ?? null, tipo: "comentario", dados: { texto: `Minuta gerada pelo Claude: ${peca.titulo} (${nome}). Revisar antes de protocolar.` }, por: m.user.id });
    return NextResponse.json({ nome, base64: buf.toString("base64"), titulo: peca.titulo, pendencias: (peca.pendencias || []).map(String).slice(0, 20), semCliente: !cli });
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    console.warn("peça", e); return erro("Não consegui gerar a peça agora. Tente de novo.", 500);
  } finally {
    if (arquivos.length) await adm.storage.from("documentos").remove(arquivos.map((a) => a.caminho)).catch(() => {});
  }
}
