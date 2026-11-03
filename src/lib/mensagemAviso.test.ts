// Mensagem ao cliente: com instruções do advogado, o Claude escreve o que foi pedido (não o modelo de ato) e cita os anexos.
import { afterEach, describe, expect, it, vi } from "vitest";
import { bancoContado } from "./teste/bancoContado";

afterEach(() => { vi.doUnmock("@/lib/rota"); vi.doUnmock("@/lib/claude"); vi.resetModules(); });
async function rodar(corpo: Record<string, unknown>) {
  const b = bancoContado({ avisos_cliente: [{ id: "a1", processo_numero: "p1", tipo_evento: "Outro", data_evento: "2026-11-05" }], processos: [{ numero: "p1", mascara: "5008754-24.2026.8.24.0054", cliente_nome: "VALDECI PEDRO RODRIGUES", cliente_id: null, banco: "BANCO C6 CONSIGNADO S.A." }] });
  const pedidos: string[] = [];
  vi.doMock("@/lib/rota", async (o) => ({ ...(await o() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u1" } }) }));
  vi.doMock("@/lib/claude", async (o) => ({ ...(await o() as object), pedirTexto: vi.fn(async (c: { text: string }[]) => { pedidos.push(c[0].text); return "Olá, Valdeci! Aqui é do escritório Passos Advocacia.\n\nSegue em anexo a prestação de contas."; }) }));
  const { POST } = await import("@/app/api/claude/mensagem/route");
  const r = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ avisoId: "a1", ...corpo }) }));
  return { j: await r.json(), prompt: pedidos[0] };
}
describe("mensagem do aviso com instruções livres", () => {
  it("segue as instruções, cita o anexo e não usa o modelo de ato", async () => {
    const { j, prompt } = await rodar({ instrucoes: "Informe que saíram os atrasados, que segue a prestação de contas e peça o Pix.", anexos: ["Prestacao_de_contas.pdf"] });
    expect(j.mensagem).toMatch(/Valdeci/);
    expect(prompt).toContain("INSTRUÇÕES DO ADVOGADO:\nInforme que saíram os atrasados");
    expect(prompt).toContain("Prestacao_de_contas.pdf");
    expect(prompt).toMatch(/chave Pix dele/);
    expect(prompt).not.toMatch(/O QUE é, QUANDO/); // o modelo de aviso de ato fica de fora
  });
  it("sem instruções, continua o aviso de ato de antes", async () => {
    const { prompt } = await rodar({});
    expect(prompt).toMatch(/O QUE é, QUANDO/); expect(prompt).not.toContain("INSTRUÇÕES DO ADVOGADO");
  });
});
