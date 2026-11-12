import { describe, expect, it } from "vitest";
import { datasRepeticao } from "./repeticao";

describe("tarefa autônoma que se repete", () => {
  it("todo dia útil de 03/11 a 18/12/2026: sem fins de semana e sem o feriado de 20/11", () => {
    const l = datasRepeticao("2026-11-03", "2026-12-18", "util");
    expect(l).toHaveLength(33); expect(l[0]).toBe("2026-11-03"); expect(l[l.length - 1]).toBe("2026-12-18");
    expect(l).not.toContain("2026-11-20"); expect(l).not.toContain("2026-11-07");
  });
  it("todos os dias, toda semana e sem repetir", () => {
    expect(datasRepeticao("2026-11-03", "2026-11-09", "todo")).toHaveLength(7);
    expect(datasRepeticao("2026-11-03", "2026-12-01", "semana")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
    expect(datasRepeticao("2026-11-03", "2026-12-18", "nao")).toEqual(["2026-11-03"]);
  });
});

import { ehAgenda, ehAudiencia, tipoAudienciaDoTexto } from "./regras";
describe("tipo de audiência", () => {
  it("pelo texto da intimação", () => {
    expect(tipoAudienciaDoTexto("Designo audiência de conciliação para o dia 20/11")).toBe("Audiência de conciliação");
    expect(tipoAudienciaDoTexto("audiência de instrução e julgamento, com depoimento pessoal")).toBe("Audiência de instrução");
    expect(tipoAudienciaDoTexto("audiência de conciliação, instrução e julgamento")).toBe("Audiência de conciliação e instrução");
    expect(tipoAudienciaDoTexto("designo audiência")).toBe("Audiência");
  });
  it("audiência com tipo continua na caixa Audiências e coletas", () => {
    expect(ehAudiencia("Audiência de instrução")).toBe(true);
    expect(ehAgenda({ tipo_evento: "Audiência de conciliação", modalidade: null })).toBe(true);
    expect(ehAgenda({ tipo_evento: "Perícia", modalidade: null })).toBe(false);
  });
});

import { temTutela } from "./tutela";
describe("aviso de tutela na peça", () => {
  it("reconhece pedido de tutela/liminar no texto", () => {
    expect(temTutela("Requer a concessão de TUTELA DE URGÊNCIA para suspender os descontos")).toBe(true);
    expect(temTutela("defere-se liminarmente a suspensão")).toBe(true);
    expect(temTutela("nos termos do art. 300 do CPC")).toBe(true);
    expect(temTutela("Manifesta-se sobre o laudo pericial, que concluiu pela falsidade da assinatura.")).toBe(false);
  });
});

import { tarefaDeOrigem, tarefasParaLigar } from "./tarefasAtivas";
describe("peça gerada fora da tarefa", () => {
  const F = "felipe", A = "amanda", N = "50005533020264047201";
  const orig = { id: "o1", status: "andamento", processo_numero: N, responsavel: A, criado_por: F, criado_em: "2026-11-05T12:00:00Z", publicacao_id: 77, descricao: "Recurso inominado", tipo: "Recurso inominado" };
  const nova = { id: "n1", status: "ajustes", processo_numero: N, responsavel: A, criado_por: A, criado_em: "2026-11-10T15:19:00Z", publicacao_id: null, descricao: "Recurso Inominado: corrigir a minuta", tipo: "Recurso inominado" };
  it("acha a tarefa que pediu a peça", () => {
    expect(tarefaDeOrigem(nova, [orig, nova])?.id).toBe("o1");
    expect(tarefaDeOrigem(orig, [orig, nova])).toBeNull(); // a original foi criada por outra pessoa: não tem origem
    expect(tarefaDeOrigem(nova, [{ ...orig, processo_numero: "outro" }, nova])).toBeNull();
  });
  it("ao enviar para correção, sugere ligar à tarefa já aberta (a da intimação primeiro)", () => {
    const outra = { ...orig, id: "o2", publicacao_id: null, descricao: "Juntar comprovante", criado_em: "2026-11-09T12:00:00Z" };
    expect(tarefasParaLigar([outra, orig], N, A, 77).map((t) => t.id)).toEqual(["o1", "o2"]);
    expect(tarefasParaLigar([{ ...orig, status: "revisao" }], N, A, 77)).toEqual([]);
    expect(tarefasParaLigar([orig], N, F, 77)).toEqual([]); // não é minha
  });
});
