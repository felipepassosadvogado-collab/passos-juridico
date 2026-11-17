// Prestação de contas: 30% sobre o proveito econômico (líquido recebido + empréstimo creditado/compensado),
// sucumbência fora da base, repasse ao cliente e lançamentos no Financeiro.
import { afterEach, describe, expect, it, vi } from "vitest";
import { calcularPrestacao, lancamentosDaPrestacao } from "./prestacao";
import { bancoContado } from "./teste/bancoContado";

describe("cálculo da prestação", () => {
  it("30% sobre líquido + empréstimo; sucumbência fica fora da base e é do escritório", () => {
    const r = calcularPrestacao({ creditos: [{ descricao: "Alvará", valor: 12000 }, { descricao: "Sucumbência", valor: 1500, sucumbencia: true }], emprestimo: 5000, pct: 30, despesas: [{ descricao: "Perícia", valor: 200 }] });
    expect(r).toMatchObject({ bruto: 13500, sucumbencia: 1500, liquidoCliente: 12000, base: 17000, honorarios: 5100, despesas: 200, repasse: 6700, aDevolver: 0, totalEscritorio: 6600 });
    expect(lancamentosDaPrestacao(r, 30, "Maria", "2026-11-17")).toEqual([
      { tipo: "receita", categoria: "Honorários contratuais", descricao: "Honorários contratuais (30%) · Maria", valor: 5100, status: "recebido", data: "2026-11-17" },
      { tipo: "receita", categoria: "Honorários de sucumbência", descricao: "Honorários de sucumbência · Maria", valor: 1500, status: "recebido", data: "2026-11-17" },
    ]);
  });
  it("empréstimo grande: honorários passam do levantado → cliente fica devendo a diferença (a receber)", () => {
    const r = calcularPrestacao({ creditos: [{ descricao: "Alvará", valor: 3000 }], emprestimo: 15000, pct: 30, despesas: [] });
    expect(r).toMatchObject({ base: 18000, honorarios: 5400, repasse: 0, aDevolver: 2400 });
    const l = lancamentosDaPrestacao(r, 30, "José", "2026-11-17");
    expect(l.map((x) => [x.valor, x.status])).toEqual([[3000, "recebido"], [2400, "previsto"]]);
  });
});

describe("rota de leitura", () => {
  afterEach(() => { vi.doUnmock("@/lib/rota"); vi.doUnmock("@/lib/supabase/server"); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
  it("manda os autos e devolve os valores lidos", async () => {
    const N = "50118012720254047201";
    const b = bancoContado({ processos: [{ numero: N, mascara: "5011801-27.2025.4.04.7201", orgao: "2ª Vara Federal de Joinville", cliente_id: "c1", cliente_nome: "JOAO DOS SANTOS", reus: ["Banco C6"] }], clientes: [{ id: "c1", nome: "João dos Santos" }], publicacoes: [{ id: 1, processo_numero: N, data: "2026-11-01", tipo_doc: "Alvará", texto: "Expeça-se alvará de R$ 12.000,00 em favor da parte autora." }] });
    vi.doMock("@/lib/rota", async (o) => ({ ...(await o() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u" } }) }));
    vi.doMock("@/lib/supabase/server", () => ({ supabaseAdmin: async () => b.sb }));
    vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.spyOn(console, "info").mockImplementation(() => {});
    let pedido = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: { body?: string }) => { pedido = init?.body || "";
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ creditos: [{ descricao: "Alvará", valor: 12000, data: "2026-11-05", sucumbencia: false }], emprestimo: { valor: 5000, descricao: "creditado" }, pct: null, despesas: [], alertas: [] }) }], stop_reason: "end_turn" })); }));
    const { POST } = await import("@/app/api/peticao/prestacao/ler/route");
    const r = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ numero: N, textos: [{ nome: "autos.pdf", paginas: 30, semTexto: [], texto: "x".repeat(200) + " ALVARÁ R$ 12.000,00" }] }) }));
    const j = JSON.parse((await r.text()).trim());
    expect(j.dados.creditos[0].valor).toBe(12000); expect(j.dados.emprestimo.valor).toBe(5000);
    expect(pedido).toContain("PROVEITO".toLowerCase().slice(0, 0)); expect(pedido).toContain("ALVARÁ R$ 12.000,00");
  });
});

import { resumirFinanceiro } from "./financeiro";
describe("resumo do Financeiro", () => {
  it("recebido, a receber, despesas, resultado e quanto veio dos processos", () => {
    const L = (tipo: "receita" | "despesa", categoria: string, valor: number, status: "previsto" | "recebido", processo_numero: string | null = null) => ({ tipo, categoria, valor, status, processo_numero });
    const r = resumirFinanceiro([L("receita", "Honorários contratuais", 5100, "recebido", "p1"), L("receita", "Honorários de sucumbência", 1500, "recebido", "p1"), L("receita", "Honorários contratuais", 2400, "previsto", "p2"),
      L("receita", "Honorários iniciais / consulta", 300, "recebido"), L("despesa", "Aluguel / coworking", 900, "recebido"), L("despesa", "Impostos", 400, "previsto")]);
    expect(r).toMatchObject({ recebido: 6900, aReceber: 2400, pago: 900, aPagar: 400, resultado: 6000, dosProcessos: 6600 });
    expect(r.porCategoria[0]).toEqual({ tipo: "receita", categoria: "Honorários contratuais", valor: 5100 });
  });
});
