// Publicação repetida no DJEN: o mesmo ato em duas comunicações sai da caixa; atos diferentes continuam todos.
import { describe, expect, it } from "vitest";
import { acharRepetidas, mesmoAto, mesmoJulgamento, tirarRepetidasDaCaixa } from "./repetidas";
import { bancoContado } from "./teste/bancoContado";

const N = "50170340520254047201";
const ACORDAO = "ACÓRDÃO. A 3ª Turma Recursal de Santa Catarina decidiu, por unanimidade, NEGAR PROVIMENTO ao recurso do Banco C6 Consignado S.A., nos termos do voto do relator. Ementa: empréstimo consignado não contratado, assinatura falsificada conforme laudo pericial, restituição em dobro e danos morais de R$ 5.000,00 mantidos. Florianópolis, 28 de outubro de 2026.";
const pub = (id: number, texto: string, data = "2026-10-29", extra: Record<string, unknown> = {}) => ({ id, processo_numero: N, data, texto, triagem: "pendente", analise: null, ...extra });

describe("mesmo ato?", () => {
  it("mesmo acórdão, mesmo dia: é repetida", () => expect(mesmoAto(pub(1, ACORDAO), pub(2, ACORDAO))).toBe(true));
  it("só muda o cabeçalho do destinatário: é repetida", () =>
    expect(mesmoAto(pub(1, "Destinatário: JAIR DOS SANTOS DE OLIVEIRA. " + ACORDAO), pub(2, "Destinatário: BANCO C6 CONSIGNADO S.A. " + ACORDAO))).toBe(true));
  it("republicada 3 dias depois: é repetida", () => expect(mesmoAto(pub(1, ACORDAO), pub(2, ACORDAO, "2026-11-01"))).toBe(true));
  it("intimação-padrão do eproc com outro nº de evento: NÃO é repetida", () => {
    const pad = (ev: number) => `Fica a parte autora intimada, por meio de seu procurador, acerca do documento juntado no evento ${ev}, para manifestação no prazo legal de 15 dias, nos termos do art. 437 do Código de Processo Civil. Intimação realizada no sistema eproc.`;
    expect(mesmoAto(pub(1, pad(45)), pub(2, pad(52)))).toBe(false);
  });
  it("outro processo, texto curto diferente, sem texto ou mais de 7 dias: NÃO é repetida", () => {
    expect(mesmoAto(pub(1, ACORDAO), { ...pub(2, ACORDAO), processo_numero: "50123633620254047201" })).toBe(false);
    expect(mesmoAto(pub(1, "Despacho: cite-se."), pub(2, "Despacho: intime-se."))).toBe(false);
    expect(mesmoAto(pub(1, ""), pub(2, ""))).toBe(false);
    expect(mesmoAto(pub(1, ACORDAO), pub(2, ACORDAO, "2026-11-20"))).toBe(false);
  });
});

describe("qual fica na caixa", () => {
  it("fica a que tem tarefa; a cópia pendente sai; a que tem tarefa nunca sai", () => {
    const r = acharRepetidas([pub(10, ACORDAO), pub(11, ACORDAO), pub(12, ACORDAO)], new Set([11]));
    expect(r).toEqual([{ id: 10, de: 11 }, { id: 12, de: 11 }]);
  });
  it("sem tarefa: fica a já tratada pela equipe, depois a mais antiga", () => {
    expect(acharRepetidas([pub(20, ACORDAO), pub(21, ACORDAO, "2026-10-29", { triagem: "concluida" })], new Set())).toEqual([{ id: 20, de: 21 }]);
    expect(acharRepetidas([pub(31, ACORDAO, "2026-10-30"), pub(30, ACORDAO)], new Set())).toEqual([{ id: 31, de: 30 }]);
  });
});

describe("na busca do DJEN", () => {
  it("tira a cópia da caixa, guarda de qual é cópia, e não mexe no resto", async () => {
    const outro = "DESPACHO. Intime-se a parte autora para se manifestar sobre o laudo pericial juntado no evento 33, no prazo de 15 dias. Joinville, 30 de outubro de 2026.";
    const b = bancoContado({
      publicacoes: [pub(1, ACORDAO), pub(2, ACORDAO), pub(3, outro, "2026-10-30"), { ...pub(4, ACORDAO), processo_numero: "50123633620254047201" }],
      tarefas: [{ id: "t1", publicacao_id: 2 }],
    });
    const fora = await tirarRepetidasDaCaixa(b.sb);
    expect(fora).toEqual([1]);
    const p1 = b.db.publicacoes.find((p) => p.id === 1)!;
    expect(p1.triagem).toBe("concluida"); expect(p1.analise.repetidaDe).toBe(2);
    expect(b.db.publicacoes.filter((p) => p.triagem === "pendente").map((p) => p.id)).toEqual([2, 3, 4]);
    expect(await tirarRepetidasDaCaixa(b.sb)).toEqual([]); // repetir não faz nada
  });
});

describe("julgamento na Turma Recursal (relatório, voto e acórdão no mesmo dia)", () => {
  const T = "3ª Turma Recursal de Santa Catarina";
  const rel = { ...pub(41, "RELATÓRIO. Trata-se de recurso inominado interposto pelo Banco C6 Consignado contra sentença que declarou nulo o contrato."), tipo_doc: "Acórdão", orgao: T };
  const voto = { ...pub(42, "VOTO. O recurso não merece provimento. O laudo pericial concluiu que a assinatura não partiu do autor."), tipo_doc: "Acórdão", orgao: T };
  const acord = { ...pub(43, "ACÓRDÃO. A 3ª Turma Recursal decidiu, por unanimidade, NEGAR PROVIMENTO ao recurso."), tipo_doc: "Acórdão", orgao: T };
  it("vira um só, e o que fica é o acórdão (com o resultado)", () => {
    expect(acharRepetidas([rel, voto, acord], new Set())).toEqual([{ id: 41, de: 43 }, { id: 42, de: 43 }]);
  });
  it("outro dia, outro órgão ou despacho: continuam separados", () => {
    expect(mesmoJulgamento(acord, { ...voto, data: "2026-11-10" })).toBe(false);
    expect(mesmoJulgamento(acord, { ...voto, orgao: "1ª Turma Recursal de Santa Catarina" })).toBe(false);
    expect(mesmoAto({ ...acord, tipo_doc: "Despacho" }, { ...voto, tipo_doc: "Despacho" })).toBe(false);
  });
  it("na busca: as três vindas na caixa ficam uma", async () => {
    const b = bancoContado({ publicacoes: [rel, voto, acord].map((x) => ({ ...x })), tarefas: [] });
    expect((await tirarRepetidasDaCaixa(b.sb)).sort()).toEqual([41, 42]);
    expect(b.db.publicacoes.filter((p) => p.triagem === "pendente").map((p) => p.id)).toEqual([43]);
  });
});
