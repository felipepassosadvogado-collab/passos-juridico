import { describe, expect, it } from "vitest";
import { COLUNAS_PADRAO, adicionarColuna, colunasCrm, etapasDe, excluirColuna, fasesDe, moverColuna, paresSemDuvida, processosDoCaso, renomearColuna, validarNome } from "./colunasCrm";

describe("colunas do CRM", () => {
  it("sem configuração usa as padrão, sem Protocolado no pré nem Encerrado no judicial", () => {
    const c = colunasCrm({});
    expect(c).toEqual(COLUNAS_PADRAO);
    expect(c.pre.map((x) => x.nome)).not.toContain("Protocolado");
    expect(c.judicial.map((x) => x.nome)).not.toContain("Encerrado");
    expect(etapasDe(c).at(-1)).toBe("Protocolado");
    expect(fasesDe(c).at(-1)).toBe("Encerrado");
  });
  it("usa a configuração e descarta nomes reservados, vazios e repetidos", () => {
    const c = colunasCrm({ crm_colunas: { pre: [{ nome: "Triagem" }, { nome: "protocolado" }, { nome: " " }, { nome: "triagem" }], judicial: [{ nome: "Encerrado" }] } });
    expect(c.pre).toEqual([{ nome: "Triagem" }]);
    expect(c.judicial).toEqual(COLUNAS_PADRAO.judicial); // só sobrou reservado: volta ao padrão
  });
  it("valida nomes", () => {
    const cols = [{ nome: "Réplica" }, { nome: "Sentença" }];
    expect(validarNome("judicial", cols, "replica")).toMatch(/Já existe/);
    expect(validarNome("judicial", cols, "Replica", "Réplica")).toBe(""); // renomear a própria coluna
    expect(validarNome("judicial", cols, "A classificar")).toMatch(/fixa/);
    expect(validarNome("pre", cols, "Protocolado")).toMatch(/fixa/);
    expect(validarNome("pre", cols, "")).toMatch(/nome/);
  });
  it("renomeia, exclui, acrescenta e reordena", () => {
    const cols = [{ nome: "A" }, { nome: "B" }, { nome: "C" }];
    expect(renomearColuna(cols, "B", " Bê ", "dica")).toEqual([{ nome: "A" }, { nome: "Bê", dica: "dica" }, { nome: "C" }]);
    expect(excluirColuna(cols, "A").map((c) => c.nome)).toEqual(["B", "C"]);
    expect(adicionarColuna(cols, "X", "", "A").map((c) => c.nome)).toEqual(["A", "X", "B", "C"]);
    expect(adicionarColuna(cols, "X", "").map((c) => c.nome)).toEqual(["A", "B", "C", "X"]);
    expect(moverColuna(cols, "A", 1).map((c) => c.nome)).toEqual(["B", "A", "C"]);
    expect(moverColuna(cols, "A", -1)).toBe(cols);
  });
});

describe("atendimento que já virou processo", () => {
  const caso = (id: string, extra = {}) => ({ id, cliente_id: "cli1", nome: "Maria", banco: "Banco C6 Consignado S.A.", processo_numero: null as string | null, criado_em: "2026-10-21T10:00:00Z", ...extra });
  const proc = (numero: string, extra = {}) => ({ numero, cliente_id: "cli1", cliente_nome: "MARIA", banco: "Banco C6 Consignado S.A.", reus: ["Banco C6 Consignado S.A.", "INSS"], criado_em: "2026-10-30T10:00:00Z", ...extra });

  it("acha o processo do mesmo cliente e banco, cadastrado depois do atendimento", () => {
    expect(processosDoCaso(caso("a"), [proc("1")], new Set()).map((p) => p.numero)).toEqual(["1"]);
    expect(processosDoCaso(caso("a"), [proc("1", { banco: "Itaú Unibanco S.A.", reus: ["Itaú Unibanco S.A."] })], new Set())).toEqual([]);
    expect(processosDoCaso(caso("a"), [proc("1", { criado_em: "2026-09-01T00:00:00Z" })], new Set())).toEqual([]); // processo antigo
    expect(processosDoCaso(caso("a"), [proc("1", { cliente_id: "cli2" })], new Set())).toEqual([]);
    expect(processosDoCaso(caso("a"), [proc("1")], new Set(["1"]))).toEqual([]); // já ligado a outro atendimento
    expect(processosDoCaso(caso("a", { banco: null }), [proc("1")], new Set()).length).toBe(1); // banco a definir
    expect(processosDoCaso(caso("a", { cliente_id: null }), [proc("1", { cliente_id: null })], new Set()).length).toBe(1); // pelo nome
  });
  it("liga sozinho só quando não há dúvida", () => {
    expect(paresSemDuvida([caso("a")], [proc("1")]).map((x) => x.caso.id + ">" + x.processo.numero)).toEqual(["a>1"]);
    expect(paresSemDuvida([caso("a")], [proc("1"), proc("2")])).toEqual([]); // dois processos possíveis
    expect(paresSemDuvida([caso("a"), caso("b")], [proc("1")])).toEqual([]); // dois atendimentos disputam o mesmo processo
    expect(paresSemDuvida([caso("a", { processo_numero: "1" }), caso("b")], [proc("1")])).toEqual([]); // o único já está ligado
  });
});
