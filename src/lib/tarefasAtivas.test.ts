import { describe, expect, it } from "vitest";
import { substituidasPorProtocolo } from "./tarefasAtivas";

describe("protocolo não aparece duas vezes", () => {
  it("elaboração aprovada que já gerou o 'Protocolar' sai; sem protocolo criado, continua", () => {
    const t = [
      { id: "elab-antonio", status: "aprovada" }, { id: "prot-antonio", status: "aberto", origem_id: "elab-antonio" },
      { id: "elab-velha", status: "aprovada" }, // aprovada antes de existir o protocolo automático: continua aparecendo
      { id: "elab-feita", status: "feito" }, { id: "prot-feito", status: "feito", origem_id: "elab-feita" },
      { id: "em-correcao", status: "revisao" },
    ];
    expect([...substituidasPorProtocolo(t)]).toEqual(["elab-antonio"]);
  });
});
