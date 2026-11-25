// Procurações sem processo (só o titular): lê, aos poucos, os documentos guardados que podem ser procuração e anota
// contra quais bancos o cliente deu poderes. Cada chamada lê um lote pequeno; a tela chama de novo até acabar.
// Cada documento é lido uma vez só (fica em procuracoes_lidas).
import { medir } from "@/lib/operacao";
import { membroDaRota, erro, respostaLonga } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pedirJson, blocoArquivo, ErroClaude, MODELO } from "@/lib/claude";
import { valeLer } from "@/lib/procuracoes";

export const maxDuration = 300;
const LOTE = 6, JUNTOS = 3, PAGINAS = 8;

type Doc = { id: string; cliente_id: string | null; tarefa_id: string | null; tipo: string | null; nome: string; caminho: string; mime: string | null; tamanho: number | null };
type Adm = Awaited<ReturnType<typeof supabaseAdmin>>;

const PROMPT = `Você recebe um documento guardado na ficha de um cliente de um escritório de advocacia brasileiro (Passos Advocacia, Dr. Felipe dos Passos Silva, OAB/SC 58.547), que move ações de aposentados contra bancos (empréstimo consignado não contratado) e o INSS. O documento pode ser uma procuração, um kit (procuração + declaração de hipossuficiência + contrato de honorários), um contrato, um documento escaneado ou outra coisa.

Diga se há PROCURAÇÃO (ad judicia, para o advogado) e, em cada procuração, contra quais BANCOS / instituições financeiras o cliente outorgou poderes (os poderes específicos costumam dizer "para propor ação contra o Banco X", "em face de", "contratos junto ao banco X", às vezes com o código do banco, ex.: 029, 626, 336). Copie o nome do banco como está escrito e o código, se houver. Não inclua o INSS na lista de bancos. Se a procuração for genérica (sem banco), deixe a lista vazia. Contrato de honorários que cite bancos também conta: inclua os bancos citados.

Responda só com JSON:
{"ehProcuracao": true|false, "outorgante": "nome do cliente" ou null, "cpf": "CPF" ou null, "data": "AAAA-MM-DD" ou null (data da assinatura), "bancos": [{"nome": "Banco Itaú Consignado S.A.", "codigo": "029" ou null}], "resumo": "1 frase: que documento é e para que são os poderes"}`;

async function todos<T>(q: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) { const { data, error } = await q(de, de + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}

async function pendentes(adm: Adm) {
  const docs = await todos<Doc>((de, ate) => adm.from("documentos").select("id,cliente_id,tarefa_id,tipo,nome,caminho,mime,tamanho").order("em").range(de, ate));
  const lidos = new Set((await todos<{ documento_id: string }>((de, ate) => adm.from("procuracoes_lidas").select("documento_id").range(de, ate))).map((x) => x.documento_id));
  const cand = docs.filter(valeLer);
  return { cand, faltam: cand.filter((d) => !lidos.has(d.id)), lidos: cand.filter((d) => lidos.has(d.id)).length };
}

/** texto do PDF (só as primeiras páginas); vazio se for escaneado */
async function textoPdf(buf: Uint8Array): Promise<{ texto: string; paginas: number }> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf)); let s = "";
    for (let i = 1; i <= Math.min(pdf.numPages, PAGINAS); i++) { const tc = await (await pdf.getPage(i)).getTextContent(); s += (tc.items as { str?: string }[]).map((x) => x.str || "").join(" ") + "\n"; }
    const n = pdf.numPages; await pdf.cleanup().catch(() => {}); return { texto: s.replace(/[ \t]+/g, " ").trim(), paginas: n };
  } catch { return { texto: "", paginas: 0 }; }
}
/** PDF escaneado grande: manda só as primeiras páginas */
async function primeirasPaginas(buf: Uint8Array, n: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(buf, { ignoreEncryption: true }); if (src.getPageCount() <= n) return buf;
  const out = await PDFDocument.create(); for (const p of await out.copyPages(src, [...Array(n).keys()])) out.addPage(p); return out.save();
}

type Lido = { ehProcuracao?: boolean; outorgante?: string | null; cpf?: string | null; data?: string | null; bancos?: { nome?: string; codigo?: string | null }[]; resumo?: string | null };

async function lerUm(adm: Adm, d: Doc, cliDaTarefa: Map<string, string | null>) {
  const linha = { documento_id: d.id, cliente_id: d.cliente_id || (d.tarefa_id ? cliDaTarefa.get(d.tarefa_id) || null : null), eh_procuracao: false, outorgante: null as string | null, cpf: null as string | null, data_doc: null as string | null, bancos: [] as { nome: string; codigo: string | null }[], resumo: null as string | null, erro: null as string | null };
  try {
    const { data, error } = await adm.storage.from("documentos").download(d.caminho);
    if (error || !data) throw new Error("arquivo não encontrado no armazenamento");
    let buf: Uint8Array = new Uint8Array(await data.arrayBuffer()); const pdf = /pdf/i.test(d.mime || "") || /\.pdf$/i.test(d.nome);
    let blocos;
    if (pdf) {
      const { texto } = await textoPdf(buf);
      if (texto.length > 400) {
        // PDF com texto: se não fala em procuração/poderes/honorários, nem pergunta ao Claude
        if (!/procura[cç][aã]o|outorg|poderes|honor[aá]rios/i.test(texto)) { linha.resumo = "Sem procuração (PDF com texto, sem menção a procuração ou poderes)."; return linha; }
        blocos = [{ type: "text" as const, text: `DOCUMENTO "${d.nome}" (texto extraído das primeiras páginas):\n\n${texto.slice(0, 60000)}` }];
      } else {
        buf = await primeirasPaginas(buf, PAGINAS);
        if (buf.byteLength > 28 * 1024 * 1024) throw new Error("PDF grande demais para ler");
        blocos = [blocoArquivo("application/pdf", Buffer.from(buf).toString("base64"))];
      }
    } else {
      if (buf.byteLength > 4.5 * 1024 * 1024) throw new Error("imagem grande demais para ler (acima de 4,5 MB)");
      blocos = [blocoArquivo(d.mime || "image/jpeg", Buffer.from(buf).toString("base64"))];
    }
    const r = await pedirJson<Lido>([...blocos, { type: "text", text: `Nome do arquivo: ${d.nome}${d.tipo ? " · guardado como: " + d.tipo : ""}\n\n` + PROMPT }], 1500, MODELO);
    linha.eh_procuracao = !!r?.ehProcuracao; linha.outorgante = r?.outorgante?.slice(0, 200) || null; linha.cpf = r?.cpf?.slice(0, 20) || null;
    linha.data_doc = r?.data?.slice(0, 10) || null; linha.resumo = r?.resumo?.slice(0, 500) || null;
    linha.bancos = (r?.bancos || []).filter((b) => b?.nome).slice(0, 12).map((b) => ({ nome: String(b.nome).slice(0, 120), codigo: b.codigo ? String(b.codigo).slice(0, 10) : null }));
  } catch (e) {
    if (e instanceof ErroClaude && e.status >= 500 && !/grande|tamanho|size/i.test(e.message)) throw e; // Claude fora do ar: tenta de novo depois
    linha.erro = (e as Error).message.slice(0, 300);
  }
  return linha;
}

async function tratar(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  if (m.perfil.papel !== "titular") return erro("Só o titular pode fazer esta análise.", 403);
  const adm = await supabaseAdmin();
  const pd = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as { acao?: string };
  let p;
  try { p = await pendentes(adm); } catch (e) {
    const msg = (e as Error).message; return erro(/procuracoes_lidas/.test(msg) ? "Falta rodar a etapa 0031 (0031_procuracoes_lidas.sql) no Supabase." : msg, 500);
  }
  if (pd.acao !== "ler") return Response.json({ candidatos: p.cand.length, lidos: p.lidos, faltam: p.faltam.length });
  const lote = p.faltam.slice(0, LOTE);
  if (!lote.length) return Response.json({ lidos: 0, faltam: 0 });
  return respostaLonga(async () => {
    // anexo de tarefa: o cliente vem do processo ou do atendimento da tarefa
    const cliDaTarefa = new Map<string, string | null>();
    const tids = [...new Set(lote.map((d) => d.tarefa_id).filter(Boolean))] as string[];
    if (tids.length) {
      const { data: ts } = await adm.from("tarefas").select("id,processo_numero,caso_id").in("id", tids);
      for (const t of (ts || []) as { id: string; processo_numero: string | null; caso_id: string | null }[]) {
        const c = t.processo_numero ? (await adm.from("processos").select("cliente_id").eq("numero", t.processo_numero).maybeSingle<{ cliente_id: string | null }>()).data?.cliente_id
          : t.caso_id ? (await adm.from("casos").select("cliente_id").eq("id", t.caso_id).maybeSingle<{ cliente_id: string | null }>()).data?.cliente_id : null;
        cliDaTarefa.set(t.id, c || null);
      }
    }
    const linhas: Awaited<ReturnType<typeof lerUm>>[] = []; let falhaClaude = "";
    for (let i = 0; i < lote.length; i += JUNTOS) {
      const r = await Promise.allSettled(lote.slice(i, i + JUNTOS).map((d) => lerUm(adm, d, cliDaTarefa)));
      for (const x of r) if (x.status === "fulfilled") linhas.push(x.value); else falhaClaude = (x.reason as Error)?.message || "Claude indisponível";
    }
    if (linhas.length) { const { error } = await adm.from("procuracoes_lidas").upsert(linhas); if (error) return { corpo: { erro: error.message } }; }
    if (!linhas.length && falhaClaude) return { corpo: { erro: falhaClaude } };
    return { corpo: { lidos: linhas.length, procuracoes: linhas.filter((l) => l.eh_procuracao).length, faltam: p.faltam.length - linhas.length } };
  }, "procuracoes.ler");
}

export async function GET(req: Request) { return medir("procuracoes.contar", () => tratar(req)); }
export async function POST(req: Request) { return medir("procuracoes.ler.pedido", () => tratar(req), {}, (r) => ({ status: r.status })); }
