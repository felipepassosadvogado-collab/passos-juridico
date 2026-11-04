import { describe, expect, it } from "vitest";
import { ligarAtendimentosAosNovos } from "./ligarAtendimentos";
import { bancoContado } from "./teste/bancoContado";

const C6 = "Banco C6 Consignado S.A.";
const caso = (id: string, cliente_id: string, extra = {}) => ({ id, cliente_id, nome: "Cliente " + cliente_id, banco: C6, processo_numero: null, criado_em: "2026-10-01T10:00:00Z", valor_causa: 15000, honorarios_pct: 30, responsavel: "amanda", etapa: "Pronto para protocolar", ...extra });
const linha = (numero: string, cliente_id: string | null, banco = C6) => ({ numero, cliente_id, cliente_nome: "Cliente", reus: [banco, "INSS"], banco });

describe("DJEN: atendimento que virou processo", () => {
  it("liga o atendimento ao processo novo, leva as tarefas e põe o processo na fase de protocolo", async () => {
    const b = bancoContado({
      casos: [caso("a", "c1"), caso("b", "c2"), caso("x", "c3"), caso("y", "c3")],
      processos: [linha("1", "c1"), linha("2", "c2", "Itaú Unibanco S.A."), linha("3", "c3")].map((p) => ({ ...p, fase: null })),
      tarefas: [{ id: "t1", caso_id: "a", processo_numero: null, status: "aberto" }, { id: "t2", caso_id: "a", processo_numero: null, status: "feito" }],
      eventos: [], config: [],
    });
    const n = await ligarAtendimentosAosNovos(b.sb, [linha("1", "c1"), linha("2", "c2", "Itaú Unibanco S.A."), linha("3", "c3")]);
    expect(n).toBe(1); // "b" é de outro banco; "x" e "y" disputam o mesmo processo: ficam para a equipe
    const a = b.db.casos.find((c) => c.id === "a")!;
    expect(a).toMatchObject({ processo_numero: "1", etapa: "Protocolado" });
    expect(b.db.processos.find((p) => p.numero === "1")).toMatchObject({ fase: "Protocolo / citação", valor_causa: 15000, responsavel: "amanda" });
    expect(b.db.tarefas.map((t) => t.processo_numero)).toEqual(["1", null]);
    expect(b.db.casos.filter((c) => c.processo_numero).length).toBe(1);
    expect(b.db.eventos.length).toBe(2);
  });
  it("sem atendimento aberto não consulta processos", async () => {
    const b = bancoContado({ casos: [caso("a", "c1", { processo_numero: "9" })], processos: [] });
    expect(await ligarAtendimentosAosNovos(b.sb, [linha("1", "c1")])).toBe(0);
    expect(b.resumo()["select processos"]).toBeUndefined();
  });
});
