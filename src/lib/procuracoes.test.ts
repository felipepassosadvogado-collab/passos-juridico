import { describe, expect, it } from "vitest";
import { bancoChave, cruzarProcuracoes, valeLer, type Lida } from "./procuracoes";

const lida = (o: Partial<Lida>): Lida => ({ documento_id: "d" + Math.random(), cliente_id: "c1", eh_procuracao: true, outorgante: "MARIA DA SILVA", cpf: "111.222.333-44", data_doc: "2026-05-10", bancos: [], resumo: null, erro: null, lido_em: "", conferidos: [], ...o });
const cli = [{ id: "c1", nome: "Maria da Silva", cpf: "11122233344" }, { id: "c2", nome: "João Souza", cpf: null }];

describe("banco", () => {
  it("mesmo banco por nome ou código", () => {
    expect(bancoChave({ nome: "Banco Itaú Consignado S.A.", codigo: "029" })?.chave).toBe("ITAU");
    expect(bancoChave("Itaú Unibanco S.A.")?.chave).toBe("ITAU");
    expect(bancoChave({ nome: "instituição 626", codigo: "626" })?.chave).toBe("C6");
    expect(bancoChave("BANCO C6 CONSIGNADO S.A.")?.chave).toBe("C6");
    expect(bancoChave("Instituto Nacional do Seguro Social - INSS")).toBeNull();
  });
});

describe("procuração sem processo", () => {
  it("C6 virou processo, Itaú 029 não: aparece só o Itaú", () => {
    const r = cruzarProcuracoes([lida({ bancos: [{ nome: "Banco C6 Consignado S.A.", codigo: "626" }, { nome: "Banco Itaú Consignado S.A.", codigo: "029" }] })], cli,
      [{ numero: "1", mascara: "1", cliente_id: "c1", cliente_nome: "MARIA DA SILVA", banco: "Banco C6 Consignado S.A.", reus: ["BANCO C6 CONSIGNADO S.A.", "INSS"] }], []);
    expect(r.map((x) => x.chave)).toEqual(["ITAU"]); expect(r[0].itau029).toBe(true); expect(r[0].situacao).toBe("sem_nada");
  });
  it("atendimento aberto sem processo fica separado; conferido some; processo pelo nome conta", () => {
    const l = lida({ cliente_id: null, outorgante: "JOAO SOUZA", cpf: null, bancos: [{ nome: "Banco BMG" }, { nome: "Banco Pan" }, { nome: "Facta" }], conferidos: ["FACTA"] });
    const r = cruzarProcuracoes([l], cli, [{ numero: "2", mascara: "2", cliente_id: null, cliente_nome: "JOÃO SOUZA", banco: null, reus: ["BANCO PAN S.A."] }],
      [{ id: "k", cliente_id: "c2", nome: "João Souza x BMG", banco: "Banco BMG S.A.", processo_numero: null, etapa: "Documentação" }]);
    expect(r.map((x) => [x.chave, x.situacao, x.clienteId])).toEqual([["BMG", "so_atendimento", "c2"]]);
  });
  it("documento que não é procuração não entra", () => {
    expect(cruzarProcuracoes([lida({ eh_procuracao: false, bancos: [{ nome: "Itaú" }] })], cli, [], [])).toEqual([]);
  });
  it("o que vale ler", () => {
    expect(valeLer({ tipo: "procuracao", nome: "p.pdf", mime: "application/pdf", cliente_id: "c" })).toBe(true);
    expect(valeLer({ tipo: "rg", nome: "rg.jpg", mime: "image/jpeg", cliente_id: "c" })).toBe(false);
    expect(valeLer({ tipo: null, nome: "peca.docx", mime: "application/vnd.openxmlformats", cliente_id: "c" })).toBe(false);
    expect(valeLer({ tipo: null, nome: "Kit procuração.pdf", mime: "application/pdf", cliente_id: null, tarefa_id: "t" })).toBe(true);
    expect(valeLer({ tipo: null, nome: "Recurso.pdf", mime: "application/pdf", cliente_id: null, tarefa_id: "t" })).toBe(false);
  });
});
