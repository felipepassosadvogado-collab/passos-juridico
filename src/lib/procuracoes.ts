// Procurações guardadas que não viraram processo: o Claude lê os documentos guardados (procuração, kit, escaneados)
// e anota contra quais bancos o cliente deu poderes; aqui cruzamos com os processos e atendimentos do cliente.
// Caso típico: o cliente assinou procuração contra o C6 e contra o Itaú Consignado (banco 029), entrou só a do C6.

export type BancoProc = { nome: string; codigo?: string | null };
export type Lida = {
  documento_id: string; cliente_id: string | null; eh_procuracao: boolean; outorgante: string | null; cpf: string | null;
  data_doc: string | null; bancos: BancoProc[]; resumo: string | null; erro: string | null; lido_em: string; conferidos: string[] | null;
  doc?: { nome: string; caminho: string; mime: string | null; tipo: string | null; em: string } | null;
};

/** banco → chave única (o mesmo banco aparece com nomes e códigos diferentes nas procurações e nos processos) */
const REGRAS: [string, string, RegExp, string[]][] = [
  ["ITAU", "Itaú (Itaú Consignado / Itaú Unibanco)", /ita[uú]/i, ["029", "341", "184", "479"]],
  ["C6", "Banco C6 Consignado", /\bC6\b|C 6 consig/i, ["336", "626"]],
  ["BMG", "Banco BMG", /\bBMG\b/i, ["318"]],
  ["PAN", "Banco Pan", /\bPAN\b|panamericano/i, ["623"]],
  ["BRADESCO", "Banco Bradesco", /bradesc/i, ["237", "394"]],
  ["DAYCOVAL", "Banco Daycoval", /daycoval/i, ["707"]],
  ["FACTA", "Facta Financeira", /facta/i, ["149"]],
  ["SANTANDER", "Banco Santander / Olé", /santander|\bol[eé]\b/i, ["033", "169"]],
  ["MERCANTIL", "Banco Mercantil do Brasil", /mercantil/i, ["389"]],
  ["AGIBANK", "Agibank", /agi\s?bank|agiplan/i, ["121"]],
  ["SAFRA", "Banco Safra", /safra/i, ["422"]],
  ["BANRISUL", "Banrisul", /banrisul|banco do estado do rio grande do sul/i, ["041"]],
  ["CAIXA", "Caixa Econômica Federal", /caixa econ|\bCEF\b/i, ["104"]],
  ["BB", "Banco do Brasil", /banco do brasil/i, ["001"]],
  ["PARANA", "Paraná Banco", /paran[aá] banco/i, ["254"]],
  ["CREFISA", "Crefisa", /crefisa/i, ["069"]],
  ["INBURSA", "Banco Inbursa", /inbursa/i, ["012"]],
  ["MASTER", "Banco Master", /banco master|\bmaster s/i, ["243"]],
  ["CETELEM", "Banco Cetelem / BNP Paribas", /cetelem|bnp/i, ["739", "752"]],
  ["SICOOB", "Sicoob", /sicoob|bancoob/i, ["756"]],
  ["SICREDI", "Sicredi", /sicredi/i, ["748"]],
  ["INTER", "Banco Inter", /banco inter\b/i, ["077"]],
  ["QI", "QI Sociedade de Crédito", /\bQI\b.*cr[eé]dito|qi tech/i, ["329"]],
  ["CAPITAL", "Capital Consig", /capital consig/i, []],
  ["SABEMI", "Sabemi", /sabemi/i, []],
];
const INSS = /instituto nacional do seguro social|\bINSS\b/i;

export function bancoChave(b: BancoProc | string): { chave: string; nome: string } | null {
  const nome = typeof b === "string" ? b : b.nome || ""; const cod = typeof b === "string" ? "" : String(b.codigo || "").replace(/\D/g, "").padStart(3, "0");
  if (INSS.test(nome) && !/banco/i.test(nome)) return null;
  for (const [chave, rot, re, cods] of REGRAS) if ((cod !== "000" && cods.includes(cod)) || re.test(nome)) return { chave, nome: rot };
  const limpo = nome.replace(/\b(S\.?\/?A\.?|LTDA|banco|financeira|cr[eé]dito|consignado)\b/gi, " ").replace(/[^\p{L}\d ]/gu, " ").replace(/\s+/g, " ").trim();
  return limpo ? { chave: limpo.toUpperCase(), nome: nome.trim() } : null;
}
export const ehItau029 = (b: BancoProc) => /ita[uú] consig/i.test(b.nome) || String(b.codigo || "").replace(/\D/g, "").padStart(3, "0") === "029";

const semAc = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
const soDig = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

type Cli = { id: string; nome: string; cpf: string | null };
type Proc = { numero: string; mascara: string; cliente_id: string | null; cliente_nome: string; banco: string | null; reus: string[]; fase?: string | null };
type Caso = { id: string; cliente_id: string | null; nome: string; banco: string | null; processo_numero: string | null; etapa: string };

export type Pendencia = {
  chave: string; clienteId: string | null; cliente: string; cpf: string | null; banco: string; bancosNaProc: BancoProc[]; itau029: boolean;
  situacao: "sem_nada" | "so_atendimento"; casoId: string | null;
  procuracoes: Lida[]; processosDoCliente: { numero: string; mascara: string; banco: string }[];
};

/** bancos que o processo/atendimento atinge (o banco escolhido e os réus) */
const chavesDoProcesso = (p: Proc) => new Set([p.banco, ...(p.reus || [])].filter(Boolean).map((x) => bancoChave(x as string)?.chave).filter(Boolean) as string[]);

/**
 * Para cada cliente, cada banco das procurações que não tem processo contra ele. O cliente é o da ficha onde o
 * documento está; se não houver, procura pelo CPF ou pelo nome do outorgante. Processos sem ficha ligada contam pelo nome.
 */
export function cruzarProcuracoes(lidas: Lida[], clientes: Cli[], processos: Proc[], casos: Caso[]): Pendencia[] {
  const porCpf = new Map(clientes.filter((c) => soDig(c.cpf).length === 11).map((c) => [soDig(c.cpf), c]));
  const porNome = new Map(clientes.map((c) => [semAc(c.nome), c]));
  const cliPorId = new Map(clientes.map((c) => [c.id, c]));
  const grupos = new Map<string, Pendencia>();
  for (const l of lidas) {
    if (!l.eh_procuracao || !l.bancos?.length) continue;
    const cli = (l.cliente_id && cliPorId.get(l.cliente_id)) || porCpf.get(soDig(l.cpf)) || (l.outorgante ? porNome.get(semAc(l.outorgante)) : undefined) || null;
    const nomeCli = cli?.nome || l.outorgante || "Cliente sem ficha"; const nomeN = semAc(nomeCli);
    const procs = processos.filter((p) => (cli && p.cliente_id === cli.id) || (!p.cliente_id && semAc(p.cliente_nome) === nomeN) || (cli && p.cliente_id === null && semAc(p.cliente_nome) === semAc(cli.nome)));
    const doCliCasos = casos.filter((c) => (cli && c.cliente_id === cli.id) || (!c.cliente_id && semAc(c.nome).includes(nomeN)));
    const temProc = new Set(procs.flatMap((p) => [...chavesDoProcesso(p)]));
    const casosPorChave = new Map<string, Caso>();
    for (const c of doCliCasos) {
      const k = c.banco ? bancoChave(c.banco)?.chave : undefined; if (!k) continue;
      if (c.processo_numero) temProc.add(k); else if (c.etapa !== "Encerrado") casosPorChave.set(k, c);
    }
    for (const b of l.bancos) {
      const bk = bancoChave(b); if (!bk || temProc.has(bk.chave) || (l.conferidos || []).includes(bk.chave)) continue;
      const id = (cli?.id || "nome:" + nomeN) + "|" + bk.chave;
      const g = grupos.get(id) || { chave: bk.chave, clienteId: cli?.id || null, cliente: nomeCli, cpf: cli?.cpf || l.cpf || null, banco: bk.nome, bancosNaProc: [], itau029: false,
        situacao: casosPorChave.has(bk.chave) ? "so_atendimento" : "sem_nada", casoId: casosPorChave.get(bk.chave)?.id || null, procuracoes: [],
        processosDoCliente: procs.map((p) => ({ numero: p.numero, mascara: p.mascara, banco: p.banco || (p.reus || []).find((r) => !INSS.test(r)) || "" })) } as Pendencia;
      if (!g.bancosNaProc.some((x) => x.nome === b.nome)) g.bancosNaProc.push(b);
      if (ehItau029(b)) g.itau029 = true;
      if (!g.procuracoes.includes(l)) g.procuracoes.push(l);
      grupos.set(id, g);
    }
  }
  // sem processo nenhum primeiro, depois Itaú 029, depois por nome
  return [...grupos.values()].sort((a, b) => (a.situacao === b.situacao ? 0 : a.situacao === "sem_nada" ? -1 : 1) || Number(b.itau029) - Number(a.itau029) || a.cliente.localeCompare(b.cliente));
}

/** documentos que valem a leitura (os da ficha que podem ser procuração; RG, comprovante, extratos e peças ficam de fora) */
export const TIPOS_FORA = ["rg", "comprovante", "extrato", "extrato_pagamento", "inicial", "calculo", "hipo"];
export const valeLer = (d: { tipo: string | null; nome: string; mime: string | null; cliente_id: string | null; tarefa_id?: string | null; tamanho?: number | null }) => {
  const arquivoOk = /pdf|image\/(jpe?g|png|webp)/i.test(d.mime || "") || /\.(pdf|jpe?g|png|webp)$/i.test(d.nome);
  if (!arquivoOk || (d.tamanho || 0) > 30 * 1024 * 1024) return false;
  if (d.cliente_id) return !TIPOS_FORA.includes(d.tipo || "");
  return /procura|kit/i.test(d.nome); // anexos de tarefa: só os que têm cara de procuração/kit
};
