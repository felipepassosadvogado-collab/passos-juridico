// Produtividade estimada de um colaborador (só para o relatório em PDF da Gestão).
// Cada atividade tem um tempo de referência (com o Claude ajudando nas peças); o tempo que vale é o MENOR entre
// a referência e o intervalo real desde a atividade anterior do dia — assim, baixas em lote ou tarefas fechadas
// em sequência não inflam o resultado, e uma peça feita em 20 minutos conta 20 minutos.

const REF: [RegExp, number][] = [
  [/elabora[çc][ãa]o de inicial|recurso inominado/i, 90],
  [/contrarraz/i, 75],
  [/r[ée]plica|laudo|alega[çc][õo]es finais|cumprimento de senten[çc]a \/ c[áa]lculos|audi[êe]ncia|^audi/i, 60],
  [/embargos|estudo de caso/i, 45],
  [/quesitos|c[áa]lculo de cumprimento|peti[çc][ãa]o de cumprimento/i, 30],
  [/peti[çc][ãa]o simples|efetuar pagamento/i, 20],
  [/juntada|protocolo da inicial|verificar documenta|transferir pagamento|outra/i, 15],
  [/protocolo da pe[çc]a|contato com o cliente|agendar coleta|alterar valor|tr[âa]nsito/i, 10],
  [/confirmar compar/i, 8],
  [/conferir protocolo|enviar mensagem|verificar retorno|recado/i, 5],
];
export const FAIXAS = { regular: 0.35, boa: 0.55, otima: 0.75 };
export const MIN_PUBLICACAO = 3; // ler e tratar uma intimação
export const MIN_MENSAGEM = 2; // escrever uma mensagem ao cliente
export const refTarefa = (tipo?: string | null, descricao?: string | null) => (REF.find(([r]) => r.test(tipo || "") || (!tipo && r.test(descricao || "")))?.[1] ?? 15);

export type Atividade = { em: string; tipo: "tarefa" | "publicacao" | "mensagem"; ref: number };
export type DiaProd = { dia: string; tarefas: number; publicacoes: number; mensagens: number; minutos: number; sistemaMin: number | null; entrada: string | null };
export type Produtividade = {
  dias: DiaProd[]; diasTrabalhados: number; mediaMin: number; jornadaMin: number; aproveitamento: number; nota: "Ótima" | "Boa" | "Regular" | "Abaixo do esperado";
  mediaSistemaMin: number | null; minPorTarefa: number | null; emLote: number; porCategoria: { nome: string; n: number; refMin: number; realMin: number }[];
};

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function calcularProdutividade(atividades: Atividade[], acessos: { dia: string; primeiro: string; segundos: number }[], jornadaMin = 480): Produtividade {
  const porDia = new Map<string, Atividade[]>();
  for (const a of atividades) { const d = diaSP(a.em); (porDia.get(d) || porDia.set(d, []).get(d)!).push(a); }
  const ac = new Map(acessos.map((a) => [a.dia, a]));
  for (const d of ac.keys()) if (!porDia.has(d)) porDia.set(d, []);
  const cat = new Map<string, { n: number; refMin: number; realMin: number }>(); let emLote = 0, minTarefas = 0, nTarefas = 0;
  const dias: DiaProd[] = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, l]) => {
    l.sort((a, b) => a.em.localeCompare(b.em));
    let antes = ac.get(dia)?.primeiro ? Date.parse(ac.get(dia)!.primeiro) : NaN; let minutos = 0;
    for (const a of l) {
      const t = Date.parse(a.em); const gap = isNaN(antes) ? a.ref : Math.max(1, (t - antes) / 60000);
      const real = Math.min(a.ref, gap); if (gap < a.ref * 0.25 && a.tipo === "tarefa") emLote++;
      minutos += real; antes = t;
      const nome = a.tipo === "tarefa" ? "Tarefas" : a.tipo === "publicacao" ? "Intimações lidas e tratadas" : "Mensagens a clientes (WhatsApp)";
      const c = cat.get(nome) || { n: 0, refMin: 0, realMin: 0 }; c.n++; c.refMin += a.ref; c.realMin += real; cat.set(nome, c);
      if (a.tipo === "tarefa") { minTarefas += real; nTarefas++; }
    }
    return { dia, tarefas: l.filter((x) => x.tipo === "tarefa").length, publicacoes: l.filter((x) => x.tipo === "publicacao").length, mensagens: l.filter((x) => x.tipo === "mensagem").length,
      minutos: Math.min(minutos, jornadaMin * 1.25), sistemaMin: ac.has(dia) ? Math.round(ac.get(dia)!.segundos / 60) : null, entrada: ac.get(dia)?.primeiro || null };
  });
  const trabalhados = dias.filter((d) => d.minutos > 0 || (d.sistemaMin || 0) > 10);
  const mediaMin = trabalhados.length ? trabalhados.reduce((s, d) => s + d.minutos, 0) / trabalhados.length : 0;
  const comSistema = trabalhados.filter((d) => d.sistemaMin != null);
  const aproveitamento = Math.min(1, mediaMin / jornadaMin);
  // régua realista: numa jornada de 8h, 6h de trabalho efetivo (75%) já é ótimo; 4h30 (55%) é bom
  const nota = aproveitamento >= FAIXAS.otima ? "Ótima" : aproveitamento >= FAIXAS.boa ? "Boa" : aproveitamento >= FAIXAS.regular ? "Regular" : "Abaixo do esperado";
  return {
    dias: trabalhados, diasTrabalhados: trabalhados.length, mediaMin, jornadaMin, aproveitamento, nota,
    mediaSistemaMin: comSistema.length ? comSistema.reduce((s, d) => s + (d.sistemaMin || 0), 0) / comSistema.length : null,
    minPorTarefa: nTarefas ? minTarefas / nTarefas : null, emLote,
    porCategoria: [...cat.entries()].map(([nome, c]) => ({ nome, ...c })),
  };
}

export const horasMin = (m: number) => { const r = Math.round(m); return r < 60 ? r + " min" : Math.floor(r / 60) + "h" + String(r % 60).padStart(2, "0"); };
