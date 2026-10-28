import { describe, expect, it } from "vitest";
import { datasDeProtocolo, montarRelatorioCrm, noPeriodo, processosParaMeta, type FiltrosCrm } from "./relatorioCrm";
import type { Caso, Processo, Tarefa } from "./tipos";

const P = (numero: string, fase: string | null, valor: number | null, extra: Partial<Processo> = {}): Processo => ({ numero, mascara: numero, tribunal: null, orgao: null, cidade: null, classe: null, cliente_id: null, cliente_nome: "Cliente " + numero.slice(0, 3), reus: [], banco: "C6", fase, notas: null, responsavel: null, ultima_data: null, ultimo_ato: null, cadastro_manual: false, criado_em: "2026-10-01T12:00:00Z", valor_causa: valor, honorarios_pct: null, ...extra });
// nº CNJ: NNNNNNN DD AAAA J TR OOOO (J=4 federal)
const n = (seq: string, ano: string, j = "4") => seq.padStart(7, "0") + "00" + ano + j + "04" + "7201";
const procs = [
  P(n("1", "2026"), "Cumprimento de sentença", 10000), P(n("2", "2026"), "Cumprimento de sentença", 20000),
  P(n("3", "2026"), "Réplica", 15000), P(n("4", "2025"), "Sentença", 5000), P(n("5", "2026"), "Encerrado", 9000), P(n("6", "2024"), null, null),
];
const tarefas = [{ id: "t1", processo_numero: n("3", "2026"), caso_id: null, tipo: "Protocolo da inicial", descricao: "Protocolo da inicial", status: "feito", feito_em: "2026-10-05T15:00:00Z", protocolo_avisado_em: null } as unknown as Tarefa];
const pubs = [{ processo_numero: n("1", "2026"), data: "2026-03-10", tipo_com: "Lista de distribuição" }, { processo_numero: n("2", "2026"), data: "2026-04-20", tipo_com: "Intimação" }, { processo_numero: n("4", "2025"), data: "2026-01-15", tipo_com: "Intimação" }];
const eventos = [{ processo_numero: n("1", "2026"), caso_id: null, tipo: "comentario", dados: { texto: "Valor da causa atualizado pelo cálculo de cumprimento de sentença (data-base 09/2026): de R$ 8.000,00 para R$ 10.000,00." }, em: "2026-10-10T10:00:00Z" },
  { processo_numero: n("1", "2026"), caso_id: null, tipo: "fase", dados: { fase: "Cumprimento de sentença" }, em: "2026-09-10T10:00:00Z" }];
const F: FiltrosCrm = { de: "", ate: "", fases: [], incluirEncerrados: false, banco: "", responsavel: "", justica: "" };
const monta = (f: Partial<FiltrosCrm> = {}) => montarRelatorioCrm({ processos: procs, casos: [] as Caso[], tarefas, pubs, eventos, filtros: { ...F, ...f }, pctPadrao: 30, nome: () => "Felipe", bancoCurto: (b) => b || "—" });

describe("datas de protocolo", () => {
  const d = datasDeProtocolo(procs, tarefas, [], pubs, eventos);
  it("tarefa de protocolo tem prioridade", () => expect(d.get(n("3", "2026"))).toMatchObject({ data: "2026-10-05", precisao: "dia" }));
  it("lista de distribuição do DJEN", () => expect(d.get(n("1", "2026"))).toMatchObject({ data: "2026-03-10", precisao: "dia" }));
  it("1ª publicação do mesmo ano é aproximada", () => expect(d.get(n("2", "2026"))?.precisao).toBe("aprox"));
  it("publicação de outro ano não serve: fica só o ano do CNJ", () => expect(d.get(n("4", "2025"))).toMatchObject({ data: "2025-01-01", precisao: "ano" }));
  it("só o ano entra quando o ano inteiro está no período", () => {
    expect(noPeriodo({ data: "2025-01-01", precisao: "ano", fonte: "" }, "2025-01-01", "2025-12-31")).toBe(true);
    expect(noPeriodo({ data: "2025-01-01", precisao: "ano", fonte: "" }, "2025-03-01", "2025-03-31")).toBe(false);
  });
});

describe("relatório", () => {
  const r = monta();
  it("encerrados ficam de fora por padrão", () => expect(r.total.n).toBe(5));
  it("médias de honorários (30%)", () => {
    expect(r.cumprimento.media).toBe(4500); // (3000 + 6000) / 2
    expect(r.andamento.comValor).toBe(2); expect(r.andamento.media).toBe(3000); // (4500 + 1500) / 2
    expect(r.total.media).toBe(3750);
  });
  it("fator de realização pelo antes/depois do cálculo", () => { expect(r.cumpr.fatorRealizacao).toBeCloseTo(1.25); expect(r.cumpr.calculados).toBe(1); });
  it("tempo do protocolo ao cumprimento", () => expect(r.cumpr.tempoMedioMeses).toBeCloseTo(6, 0));
  it("filtro de período do protocolo", () => { const m = monta({ de: "2026-10-01", ate: "2026-10-31" }); expect(m.linhas.map((l) => l.fase)).toEqual(["Réplica"]); });
  it("filtro de fase", () => expect(monta({ fases: ["Cumprimento de sentença"] }).total.n).toBe(2));
  it("processos para a meta", () => { expect(processosParaMeta(45000, 4500)).toBe(10); expect(processosParaMeta(45000, 4500, 0.5)).toBe(20); });
});
