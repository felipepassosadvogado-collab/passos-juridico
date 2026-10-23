import { expect, it, vi } from "vitest";
import { buscarIndices } from "./indicesBcb";

it("busca em janelas de até 10 anos, tenta de novo quando falha e junta tudo", async () => {
  const urls: string[] = []; let falhou = false;
  const f = vi.fn(async (u: string) => {
    urls.push(u);
    if (!falhou && u.includes("sgs.433") && u.includes("01/01/2015")) { falhou = true; return new Response("erro", { status: 503 }); }
    const ano = u.match(/dataInicial=01\/01\/(\d{4})/)![1];
    return new Response(JSON.stringify([{ data: `01/01/${ano}`, valor: "0.50" }, { data: `01/02/${ano}`, valor: "-0.10" }]));
  }) as unknown as typeof fetch;
  const ix = await buscarIndices(f);
  expect(ix.ipca["2015-01"]).toBeCloseTo(0.005); expect(ix.selic["2025-02"]).toBeCloseTo(-0.001);
  expect(urls.every((u) => /dataFinal=\d\d\/\d\d\/\d{4}/.test(u))).toBe(true);
  expect(urls.filter((u) => u.includes("sgs.433")).length).toBe(4); // 2005, 2015 (2x), 2025
}, 20000);
