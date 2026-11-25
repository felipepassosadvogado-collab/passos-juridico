// Relatório "Enviadas por" (WhatsApp do escritório): quantas mensagens a pessoa mandou, para quantos clientes,
// em quais dias e horários, e a lista das mensagens. Datas e horas no horário de Brasília.

export type MsgEnviada = { id: string; conversa_id: string; texto: string | null; tipo: string; anexo_nome: string | null; em: string; agente: boolean | null };
export type DiaEnviadas = { dia: string; n: number; conversas: number; primeira: string; ultima: string };
export type ResumoEnviadas = {
  total: number; conversas: number; diasComEnvio: number; diasUteis: number; mediaDiaUtil: number; anexos: number; peloAssistente: number;
  dias: DiaEnviadas[]; porConversa: { conversa_id: string; n: number }[];
};

const TZ = "America/Sao_Paulo";
export const diaBR = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
export const horaBR = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
/** limites do período (dias locais, inclusive) em ISO, para a consulta */
export const limitesISO = (de: string, ate: string) => ({ ini: `${de}T00:00:00-03:00`, fim: `${ate}T23:59:59.999-03:00` });

/** dias úteis (seg a sex) de "de" até "ate", sem passar de hoje */
export function diasUteis(de: string, ate: string, hoje: string): number {
  const fim = ate < hoje ? ate : hoje; let n = 0;
  for (let d = new Date(de + "T12:00:00Z"); d.toISOString().slice(0, 10) <= fim; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w > 0 && w < 6) n++; }
  return n;
}

export function resumirEnviadas(ms: MsgEnviada[], de: string, ate: string, hoje: string): ResumoEnviadas {
  const porDia = new Map<string, MsgEnviada[]>(); const porConv = new Map<string, number>();
  for (const m of ms) { const d = diaBR(m.em); porDia.set(d, [...(porDia.get(d) || []), m]); porConv.set(m.conversa_id, (porConv.get(m.conversa_id) || 0) + 1); }
  const dias = [...porDia].sort((a, b) => b[0].localeCompare(a[0])).map(([dia, l]) => {
    const em = l.map((x) => x.em).sort();
    return { dia, n: l.length, conversas: new Set(l.map((x) => x.conversa_id)).size, primeira: horaBR(em[0]), ultima: horaBR(em[em.length - 1]) };
  });
  const du = diasUteis(de, ate, hoje);
  return {
    total: ms.length, conversas: porConv.size, diasComEnvio: dias.length, diasUteis: du, mediaDiaUtil: du ? Math.round((ms.length / du) * 10) / 10 : 0,
    anexos: ms.filter((m) => m.tipo !== "texto").length, peloAssistente: ms.filter((m) => m.agente).length,
    dias, porConversa: [...porConv].map(([conversa_id, n]) => ({ conversa_id, n })).sort((a, b) => b.n - a.n),
  };
}
