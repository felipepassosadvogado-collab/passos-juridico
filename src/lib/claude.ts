// Chamadas à API da Anthropic (só no servidor; a chave fica na Vercel).
import { FASES } from "./tipos";
import { TAREFAS, TIPOS_EV } from "./regras";
import type { Analise } from "./tipos";

export const MODELO = "claude-sonnet-5-5";
type Bloco = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export class ErroClaude extends Error { constructor(msg: string, public status = 502) { super(msg); } }

/** manda o pedido e devolve o JSON da resposta */
export async function pedirJson<T = unknown>(conteudo: Bloco[], maxTokens = 6000): Promise<T> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new ErroClaude("Falta cadastrar a chave ANTHROPIC_API_KEY na Vercel para usar o Claude.", 503);
  let r: Response | null = null;
  for (let i = 0; i < 3; i++) {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, messages: [{ role: "user", content: conteudo }] }),
    });
    if (r.status !== 429 && r.status !== 529 && r.status < 500) break;
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
  if (!r || !r.ok) {
    const corpo = await r?.text().catch(() => "");
    console.warn("claude", r?.status, corpo?.slice(0, 500));
    if (r?.status === 401) throw new ErroClaude("A chave ANTHROPIC_API_KEY cadastrada na Vercel não foi aceita. Confira a chave.", 503);
    if (r?.status === 400 && /credit|billing|balance/i.test(corpo || "")) throw new ErroClaude("A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com.", 503);
    if (r?.status === 429) throw new ErroClaude("Muitas análises seguidas. Espere um pouco e tente de novo.", 429);
    if (r?.status === 413 || /too large|too long/i.test(corpo || "")) throw new ErroClaude("Arquivo ou texto grande demais. Envie menos páginas por vez.", 413);
    throw new ErroClaude("O Claude não respondeu agora. Tente de novo em instantes.");
  }
  const j = await r.json();
  const texto: string = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  const a = texto.search(/[[{]/); const b = Math.max(texto.lastIndexOf("]"), texto.lastIndexOf("}"));
  if (a < 0 || b < a) throw new ErroClaude("A resposta veio fora do formato. Tente de novo.");
  try { return JSON.parse(texto.slice(a, b + 1)) as T; } catch { throw new ErroClaude("A resposta veio fora do formato. Tente de novo."); }
}

// ───────────── análise das publicações (mesmas instruções do painel antigo) ─────────────
const INSTR = `Você auxilia um advogado que representa a parte AUTORA (aposentados/pensionistas) em ações contra bancos e o INSS sobre empréstimos consignados não contratados, quase sempre no Juizado Especial Federal (eproc, TRF4). Fases possíveis: ${FASES.join("; ")}. Tarefas possíveis: ${TAREFAS.join("; ")}.
Para cada publicação, identifique o ato, resuma o que foi determinado, diga a providência do advogado do autor, a tarefa correspondente (uma da lista, ou null se for só ciência) e o prazo em dias úteis para o autor (null se não houver prazo). Quando o texto apenas cita um evento (ex.: "Evento 63 - LAUDO PERICIAL") sem prazo expresso, sugira o prazo usual e explique em "obs". Indique também se o CLIENTE (autor) precisa ser avisado pessoalmente porque foi marcada perícia, audiência, coleta de padrão grafotécnico/assinatura, depoimento ou comparecimento, com data, hora, local e orientações práticas ao cliente (o que levar, onde ir). Não invente fatos que não estejam no texto.`;
const FMT = `Responda só com JSON: um array com um objeto por publicação, na mesma ordem: {"id": string, "ato": string curto, "resumo": string de 1-2 frases, "providencia": string ou "Nenhuma — apenas ciência", "tarefa": uma das tarefas ou null, "prazoDias": número ou null, "fase": uma das fases ou null, "obs": string ou "", "intimarCliente": true ou false, "evento": null ou {"tipo": "${TIPOS_EV.join('" | "')}", "data": "AAAA-MM-DD" ou null, "hora": "HH:MM" ou null, "local": string ou null, "orientacoes": string curta ao cliente}}`;
const corte = (s: string | null, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");

export type PubParaAnalise = { id: number; data: string; tipo_doc: string | null; tipo_com: string | null; orgao: string | null; texto: string | null; mascara?: string };

export async function analisarPublicacoes(lista: PubParaAnalise[]): Promise<Record<string, Analise>> {
  const entrada = lista.map((c) => ({ id: String(c.id), data: c.data, tipo: c.tipo_doc || c.tipo_com, orgao: c.orgao, processo: c.mascara || "", texto: corte(c.texto, 5000) }));
  const out = await pedirJson<unknown>([{ type: "text", text: INSTR + "\n\n" + FMT + "\n\nPublicações:\n" + JSON.stringify(entrada) }], 8000);
  const res: Record<string, Analise> = {};
  for (const r of (Array.isArray(out) ? out : [out]) as Record<string, unknown>[]) {
    if (!r?.id) continue;
    const ev = r.evento && typeof r.evento === "object" ? (r.evento as Record<string, unknown>) : null;
    res[String(r.id)] = {
      ato: String(r.ato || ""), resumo: String(r.resumo || ""), providencia: String(r.providencia || ""),
      tarefa: TAREFAS.includes(String(r.tarefa)) ? String(r.tarefa) : null,
      prazoDias: Number.isFinite(+(r.prazoDias as number)) && +(r.prazoDias as number) > 0 ? Math.round(+(r.prazoDias as number)) : null,
      fase: (FASES as readonly string[]).includes(String(r.fase)) ? String(r.fase) : null, obs: String(r.obs || ""), intimarCliente: !!r.intimarCliente,
      evento: ev ? { tipo: String(ev.tipo || ""), data: (ev.data as string) || null, hora: (ev.hora as string) || null, local: (ev.local as string) || null, orientacoes: String(ev.orientacoes || "") } : null,
    };
  }
  return res;
}

// ───────────── leitura de documentos (fotos e PDFs) ─────────────
export function blocoArquivo(mime: string, base64: string): Bloco {
  if (mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  return { type: "image", source: { type: "base64", media_type: /png|webp|gif/.test(mime) ? mime : "image/jpeg", data: base64 } };
}

export const PROMPT_DOCS = `Você recebe documentos de um cliente de um escritório de advocacia brasileiro (fotos ou PDFs): documento de identidade (RG ou CNH), comprovante de residência e procuração (que costuma trazer a qualificação completa). Extraia os dados do CLIENTE (o outorgante da procuração, o titular do RG).
Regras: copie exatamente o que está escrito; não invente nem complete dados ilegíveis (use null). Datas no formato AAAA-MM-DD. CPF com 11 dígitos. Se o comprovante de residência estiver em nome de outra pessoa, ou se houver divergência entre documentos (nome, endereço, CPF), explique em "observacoes". Diga também o tipo de cada arquivo, na ordem recebida.
Responda só com JSON: {"nome":string|null,"cpf":string|null,"rg":string|null (número e órgão emissor/UF),"nascimento":string|null,"nacionalidade":string|null,"estadoCivil":string|null,"profissao":string|null,"nomeMae":string|null,"endereco":string|null (logradouro, número, complemento, bairro),"cep":string|null,"cidade":string|null (formato "Cidade/UF"),"telefone":string|null,"email":string|null,"parteContraria":string|null (banco ou empresa contra quem a ação será proposta, se a procuração disser),"observacoes":string,"tipos":[uma entrada por arquivo: "rg"|"comprovante"|"procuracao"|"contrato"|"outro"]}`;

export const promptExtrato = (banco?: string) => `Você recebe o extrato de empréstimos consignados do INSS (HISCON) de um aposentado/pensionista (fotos ou PDF). Copie exatamente o que está escrito; use null se não houver. Datas em AAAA-MM-DD; valores como número com ponto decimal.
Responda só com JSON: {"especie": string|null (espécie do benefício por extenso, em minúsculas), "nb": string|null, "bancoPagador": string|null (instituição que paga o benefício), "contratos": [{"numero": string, "banco": string, "parcela": number|null, "inclusao": string|null, "inicioDesconto": string|null, "situacao": string|null, "parcelasDescontadas": number|null}]}${banco ? " Liste primeiro os contratos do banco " + banco + "." : ""}`;
