// O assistente do WhatsApp nunca manda marcação de ferramenta ao cliente; a chamada escrita como texto é executada.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chamadasEmTexto, extrairResposta } from "./agente";
import { bancoContado } from "./teste/bancoContado";

const FABRICIO = `Entendi, Fabricio.\n<invoke name="transferir_para_equipe">\n<parameter name="motivo">cliente quer falar com o advogado</parameter>\n<parameter name="resumo">pergunta sobre valores</parameter>\n</invoke>`;

describe("marcação de ferramenta no texto", () => {
  it("separa a chamada e devolve só o texto normal", () => {
    const r = chamadasEmTexto(FABRICIO);
    expect(r.limpo).toBe("Entendi, Fabricio.");
    expect(r.chamadas).toEqual([{ nome: "transferir_para_equipe", args: { motivo: "cliente quer falar com o advogado", resumo: "pergunta sobre valores" } }]);
  });
  it("só marcação: texto vazio; chamada cortada no fim também é reconhecida", () => {
    expect(chamadasEmTexto('<invoke name="transferir_para_equipe"><parameter name="motivo">x</parameter>').limpo).toBe("");
    expect(chamadasEmTexto("<function_calls><invoke name=\"anotar_para_equipe\"><parameter name=\"texto\">a</parameter></invoke></function_calls>").chamadas[0].nome).toBe("anotar_para_equipe");
  });
  it("última barreira: parte com marcação nunca vira mensagem", () => {
    expect(extrairResposta(FABRICIO)).toEqual([]);
    expect(extrairResposta("<resposta>Olá, tudo bem?\n---\n<invoke name=\"x\"></invoke></resposta>")).toEqual(["Olá, tudo bem?"]);
  });
});

describe("Escrever com o Claude no painel de WhatsApp", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock("@/lib/rota"); });
  it("lê a conversa e o processo mais recente do cliente", async () => {
    const b = bancoContado({
      wa_conversas: [{ id: "cv1", nome: "Teresinha", telefone: "5547999996278", cliente_id: "c1" }],
      wa_mensagens: [{ conversa_id: "cv1", de_mim: false, texto: "Eu quero o numero do meu processo", tipo: "texto", em: "2026-11-07T14:23:00Z", agente: false }],
      clientes: [{ id: "c1", nome: "TERESINHA DO AMARAL" }],
      processos: [{ numero: "50199160220254047201", mascara: "5019916-02.2025.4.04.7201", cliente_id: "c1", cliente_nome: "TERESINHA", banco: "C6", reus: ["C6", "INSS"], orgao: "3ª Turma Recursal de SC", fase: "Recurso", ultimo_ato: "Custas", ultima_data: "2026-08-10", notas: null }],
      publicacoes: [],
    });
    vi.doMock("@/lib/rota", async (orig) => ({ ...(await orig() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u1" } }) }));
    vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.spyOn(console, "info").mockImplementation(() => {});
    let pedido = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: { body?: string }) => { pedido = String(init?.body || "");
      return new Response(JSON.stringify({ content: [{ type: "text", text: "<mensagem>Olá, Teresinha! O número do seu processo é 5019916-02.2025.4.04.7201.</mensagem>" }], stop_reason: "end_turn" }), { headers: { "content-type": "application/json" } }); }));
    const { POST } = await import("@/app/api/claude/resposta-atendimento/route");
    const r = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ conversaId: "cv1", instrucoes: "Informar o número do processo." }) }));
    const j = await r.json();
    expect(r.status).toBe(200); expect(j.mensagem).toContain("5019916-02.2025.4.04.7201");
    expect(pedido).toContain("5019916-02.2025.4.04.7201"); expect(pedido).toContain("Eu quero o numero do meu processo"); expect(pedido).toContain("Informar o número do processo");
  });
});

import { equipeFalouHaPouco } from "./agente";
describe("assistente não manda código ao cliente", () => {
  it("<tool_call> sozinho ou com JSON nunca vira mensagem, e a ferramenta é executada", () => {
    expect(extrairResposta("<tool_call>")).toEqual([]);
    expect(extrairResposta("<tool_call>\n</tool_call>")).toEqual([]);
    const r = chamadasEmTexto('<tool_call>{"name": "anotar_para_equipe", "arguments": {"texto": "campanha expirou"}}</tool_call>');
    expect(r.limpo).toBe(""); expect(r.chamadas).toEqual([{ nome: "anotar_para_equipe", args: { texto: "campanha expirou" } }]);
    expect(chamadasEmTexto("Obrigado pelo retorno!\n<tool_call>\n<invoke name=\"anotar_para_equipe\">").limpo).toBe("Obrigado pelo retorno!");
    expect(extrairResposta('{"name": "transferir_para_equipe", "arguments": {}}')).toEqual([]);
    expect(extrairResposta("Combinado, obrigado!")).toEqual(["Combinado, obrigado!"]);
  });
  it("fica quieto quando a equipe escreveu pelo sistema nas últimas 12 h (aviso automático não conta)", () => {
    const agora = new Date("2026-11-11T13:39:00Z");
    const equipe = { de_mim: true, agente: false, enviado_por: "amanda", bruto: { origem: "equipe" }, em: "2026-11-11T13:14:00Z" };
    expect(equipeFalouHaPouco([equipe], agora)).toBe(true);
    expect(equipeFalouHaPouco([{ ...equipe, bruto: { origem: "aviso" } }], agora)).toBe(false);
    expect(equipeFalouHaPouco([{ ...equipe, em: "2026-11-10T13:00:00Z" }], agora)).toBe(false);
  });
});

describe("devolver ao assistente", () => {
  it("mensagens da equipe anteriores à devolução não seguram o assistente", () => {
    const agora = new Date("2026-11-11T13:55:00Z");
    const equipe = { de_mim: true, agente: false, enviado_por: "felipe", bruto: { origem: "equipe" }, em: "2026-11-11T13:28:00Z" };
    expect(equipeFalouHaPouco([equipe], agora, "2026-11-11T13:50:00Z")).toBe(false);
    expect(equipeFalouHaPouco([{ ...equipe, em: "2026-11-11T13:52:00Z" }], agora, "2026-11-11T13:50:00Z")).toBe(true);
  });
});
