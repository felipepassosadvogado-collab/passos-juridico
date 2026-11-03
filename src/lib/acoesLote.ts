// Ações das telas que gravam muitos registros de uma vez, agora em lote (antes: uma ida ao banco por registro).
// A regra de cada uma continua exatamente a mesma; muda só a quantidade de consultas.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { atualizarAgrupado, inserirEmLote } from "./emLote";
import { nomeBonito, semAcento } from "./formato";

type Cliente = { from: (t: string) => any };

/** CRM "Sugerir fases automaticamente": grava as fases (1 consulta por fase) e o histórico de cada processo (1 consulta) */
export async function classificarFases(sb: Cliente, itens: { numero: string; fase: string; motivo?: string }[], eu: string, origem = "sugestão automática") {
  const r = await atualizarAgrupado(sb, "processos", "numero", itens.map((x) => ({ id: x.numero, campos: { fase: x.fase } })));
  const gravados = new Set(r.linhas.map((p) => p.numero));
  const ev = await inserirEmLote(sb, "eventos", itens.filter((x) => gravados.has(x.numero)).map((x) => ({ processo_numero: x.numero, tipo: "fase", dados: { fase: x.fase + " (" + origem + ")", ...(x.motivo ? { texto: "Fase " + x.fase + " (" + origem + "): " + x.motivo } : {}) }, por: eu })), 500, "id");
  if (ev.erro) console.warn("evento", ev.erro);
  return { linhas: r.linhas, erro: r.erro };
}

/**
 * Clientes "Ligar processos sem cliente": mesma regra de antes (ficha de mesmo nome; cria a ficha quando não existe;
 * ignora bancos, empresas, INSS e processos em sigilo). Fichas novas: 1 consulta; processos: 1 consulta por ficha.
 */
export async function vincularProcessos(sb: Cliente, processos: { numero: string; cliente_id: string | null; cliente_nome: string | null }[], clientes: { id: string; nome: string }[]) {
  const porNome = new Map(clientes.map((c) => [semAcento(c.nome), c.id]));
  const alvo: { numero: string; chave: string; nome: string }[] = [];
  for (const p of processos) {
    if (p.cliente_id) continue; const nome = (p.cliente_nome || "").split(" / ")[0].trim();
    if (!nome || /\bbanco\b|s\.?a\.?$|ltda|instituto nacional|sigilo/i.test(nome)) continue;
    alvo.push({ numero: p.numero, chave: semAcento(nome), nome });
  }
  // fichas que faltam, uma por nome (antes: uma inserção por processo sem ficha)
  const faltam = [...new Map(alvo.filter((a) => !porNome.has(a.chave)).map((a) => [a.chave, a.nome])).entries()];
  const novas = await inserirEmLote(sb, "clientes", faltam.map(([, nome]) => ({ nome: nomeBonito(nome) })));
  if (!novas.erro) novas.linhas.forEach((c, i) => { if (faltam[i]) porNome.set(faltam[i][0], c.id); }); // o banco devolve na mesma ordem da inserção
  const itens = alvo.map((a) => ({ id: a.numero, campos: { cliente_id: porNome.get(a.chave) } })).filter((x) => x.campos.cliente_id);
  const r = await atualizarAgrupado(sb, "processos", "numero", itens);
  return { ligados: r.linhas.length, fichasNovas: novas.linhas, processos: r.linhas, erro: r.erro || novas.erro };
}
