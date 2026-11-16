// Petição inicial: o pedido de danos materiais (g) usa o indébito atualizado do cálculo, igual ao valor da causa.
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { bancoContado } from "./teste/bancoContado";

afterEach(() => { vi.doUnmock("@/lib/rota"); vi.resetModules(); });
async function gerar(indebitoAtualizado: string) {
  const b = bancoContado({ clientes: [{ id: "c1", nome: "Maria", cpf: "000.000.000-00", endereco: "Rua A, 1", cep: "89200-000", cidade: "Joinville/SC", nascimento: "1950-01-01" }], documentos: [], eventos: [] });
  vi.doMock("@/lib/rota", async (o) => ({ ...(await o() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u" }, perfil: { id: "u", papel: "titular" } }) }));
  const { POST } = await import("@/app/api/peticao/route");
  const r = await POST(new Request("http://x/api/peticao", { method: "POST", body: JSON.stringify({ clienteId: "c1", banco: "Banco C6 Consignado S.A.", bancoQualif: ", CNPJ x", especie: "aposentadoria", nb: "123", genero: "F",
    contratos: [{ numero: "010001619585", parcela: "14,15", inclusao: "2021-01-05" }], total: "976,35", moral: "10.000,00", indebitoAtualizado, cidadeJuizo: "Joinville" }) }));
  expect(r.status).toBe(200);
  const z = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  return (await z.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
}
describe("pedido de danos materiais na inicial", () => {
  it("com cálculo: pedido (g) e causa pelo indébito atualizado", async () => {
    const t = await gerar("2.723,67");
    expect(t).toMatch(/no valor de R\$ 2\.723,67/); expect(t).not.toMatch(/no valor de R\$ 1\.952,70/);
    expect(t).toMatch(/valor de R\$ 12\.723,67/);
  });
  it("sem cálculo: cai no dobro nominal", async () => { expect(await gerar("")).toMatch(/no valor de R\$ 1\.952,70/); });
});
