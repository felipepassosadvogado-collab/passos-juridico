// A peça gerada já traz pedido de tutela de urgência / liminar? (a caixa de revisão avisa o que encontrou)
export const temTutela = (texto: string) => /tutela\s+(provis[oó]ria\s+)?(de\s+urg[eê]ncia|antecipada|de\s+evid[eê]ncia)|\bliminar(mente)?\b|art\.?\s*300\s+do\s+(c[oó]digo|cpc)/i.test(texto);
