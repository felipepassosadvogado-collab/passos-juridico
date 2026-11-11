// Clientes que a assistente virtual passou para a equipe e ainda esperam resposta.
// "Chamadas sem resposta" = o pedido que levou à transferência + cada mensagem que o cliente
// mandou depois da última mensagem do escritório. Ao chegar em ALERTA_CHAMADAS, o balão fica vermelho.
export const ALERTA_CHAMADAS = 3;

export type MsgEspera = { de_mim: boolean; em: string };
export type Espera = { chamadas: number; desde: string | null };

/** conta as chamadas sem resposta de uma conversa (mensagens em qualquer ordem) */
export function esperaDaConversa(msgs: MsgEspera[]): Espera {
  const l = [...msgs].sort((a, b) => a.em.localeCompare(b.em));
  let ultimaMinha = -1;
  for (let i = l.length - 1; i >= 0; i--) if (l[i].de_mim) { ultimaMinha = i; break; }
  const depois = l.slice(ultimaMinha + 1).filter((m) => !m.de_mim);
  // a transferência em si já é a 1ª chamada: quando a assistente respondeu "já chamei a equipe",
  // não há mensagem do cliente depois dela, mas ele está esperando
  const chamadas = Math.max(1, depois.length);
  const desde = depois[0]?.em || (ultimaMinha >= 0 ? l[ultimaMinha].em : null);
  return { chamadas, desde };
}

/** "há 5 min", "há 2 h", "há 3 dias" */
export function haQuanto(desde: string | null, agora = Date.now()) {
  if (!desde) return "";
  const min = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}
