import { describe, expect, it } from "vitest";
import { selecionarPaginas, textoSelecionado, type Pagina } from "./selecaoPaginas";

const autos = (n: number, ondeLaudo: number[] = [], escaneadas: number[] = []): Pagina[] => Array.from({ length: n }, (_, i) => ({ arquivo: 0, n: i + 1,
  texto: escaneadas.includes(i + 1) ? null : ondeLaudo.includes(i + 1) ? "LAUDO PERICIAL GRAFOTÉCNICO. O perito conclui que a assinatura questionada não partiu do autor. Quesito 1..." : `Página comum ${i + 1}, certidão, procuração.` }));

describe("modo econômico: no máximo 40 páginas", () => {
  it("processo pequeno vai inteiro", () => { const s = selecionarPaginas(autos(30), "Manifestação ao laudo pericial"); expect(s.escolhidas).toHaveLength(30); expect(s.motivo).toBe(""); });
  it("cópia integral de 300 páginas: começo + laudo (no meio) + fim, em ordem, 40 no total", () => {
    const s = selecionarPaginas(autos(300, [150, 151, 152, 153]), "Manifestação ao laudo pericial");
    const ns = s.escolhidas.map((p) => p.n);
    expect(ns).toHaveLength(40); expect(s.total).toBe(300);
    expect(ns.slice(0, 3)).toEqual([1, 2, 3]); // a inicial
    expect(ns).toEqual(expect.arrayContaining([150, 151, 152, 153, 154])); // o laudo e a página seguinte
    expect(ns).toContain(300); expect(ns).toEqual([...ns].sort((a, b) => a - b));
  });
  it("sem palavras do tipo: começo e fim", () => {
    const ns = selecionarPaginas(autos(100), "Petição simples").escolhidas.map((p) => p.n);
    expect(ns).toEqual([1, 2, 3, ...Array.from({ length: 37 }, (_, i) => 64 + i)]);
  });
  it("texto marca as páginas omitidas; em PDF de texto, página sem texto não ocupa vaga", () => {
    const s = selecionarPaginas(autos(60, [], [59]), "x", 6);
    const [t] = textoSelecionado(s, ["autos.pdf"]);
    expect(s.escolhidas.map((p) => p.n)).toEqual([1, 2, 3, 57, 58, 60]);
    expect(t.texto).toContain("[… páginas 4 a 56 omitidas (modo econômico) …]"); expect(t.semTexto).toEqual([]);
  });
  it("PDF escaneado (laudo digitalizado) junto com a cópia: as páginas dele vão como imagem", () => {
    const laudo: Pagina[] = Array.from({ length: 8 }, (_, i) => ({ arquivo: 1, n: i + 1, texto: null }));
    const s = selecionarPaginas([...autos(20), ...laudo], "Manifestação ao laudo pericial");
    expect(s.escolhidas.filter((p) => p.texto == null)).toHaveLength(8);
    const ts = textoSelecionado(s, ["autos.pdf", "laudo.pdf"]); expect(ts[1].semTexto).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
