import { describe, expect, it } from "vitest";
import { ultimosAvisos } from "./ultimoAviso";
import type { Aviso } from "./tipos";
const av = (id: string, status: Aviso["status"], criado: string, avisado: string | null = null, n = "1") => ({ id, processo_numero: n, status, criado_em: criado, avisado_em: avisado } as Aviso);
describe("último aviso", () => {
  it("vale o último enviado, mesmo com pendente mais novo", () => {
    const m = ultimosAvisos([av("a", "avisado", "2026-11-01", "2026-11-02"), av("b", "pendente", "2026-11-20"), av("c", "avisado", "2026-11-10", "2026-11-11")]);
    expect(m.get("1")!.av.id).toBe("c");
  });
  it("sem enviado: o pendente mais recente", () => {
    expect(ultimosAvisos([av("a", "pendente", "2026-11-01"), av("b", "pendente", "2026-11-05")]).get("1")!.av.id).toBe("b");
  });
});
