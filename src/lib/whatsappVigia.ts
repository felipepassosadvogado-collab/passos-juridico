// Vigia do WhatsApp: a conexão pode "cair calada" — a Evolution diz que está conectada (open), mas para de receber
// mensagens do WhatsApp, ou recebe e não consegue entregar ao sistema. O vigia roda a cada ~10 minutos (pelo sistema
// aberto e pelas rotinas da Vercel) e:
//   1. confere o estado da conexão;
//   2. confere (e conserta) o endereço de entrega das mensagens (webhook);
//   3. "cutuca" o WhatsApp com uma consulta real (o número do escritório existe?): se não responder, a conexão está
//      travada → reinicia a conexão na Evolution (não precisa de QR-code);
//   4. busca no servidor as mensagens das últimas horas e grava as que não chegaram ao sistema;
//   5. horário comercial e 1 hora sem nenhuma mensagem recebida, nem no servidor → reinicia por precaução (no máx. 1 vez por hora).
//   6. "Verificar agora" do titular: sem mensagem recebida há 20 min → reinicia (ele está dizendo que não chega).
// O resultado fica em config "whatsapp_vigia" (painel do WhatsApp) e problemas sem conserto avisam o titular.
import type { Adm } from "./whatsappDb";

export type EventoVigia = { em: string; tipo: "ok" | "conserto" | "problema"; texto: string };
export type EstadoVigia = {
  em: string; estado: string; ok: boolean; resumo: string; sonda: "ok" | "falhou" | "pulada";
  ultimaRecebidaServidor: string | null; ultimaRecebidaSistema: string | null; ultimoReinicio: string | null; ultimoAviso: string | null;
  recuperadas: number; historico: EventoVigia[];
};

const H = 3600e3;
/** horário comercial em Brasília: seg–sex, 8h às 20h */
export function horarioComercial(agora: Date) {
  const b = new Date(agora.getTime() - 3 * H); const d = b.getUTCDay(), h = b.getUTCHours();
  return d >= 1 && d <= 5 && h >= 8 && h < 20;
}

/** precisa reiniciar por silêncio? horas sem mensagem recebida em horário comercial (contando só o tempo comercial de hoje) */
export function silencioSuspeito(o: { agora: Date; ultimaRecebida: string | null; ultimoReinicio: string | null; horas?: number }) {
  const horas = o.horas ?? 1;
  if (!horarioComercial(o.agora)) return false;
  const inicioDia = new Date(o.agora.getTime() - 3 * H); inicioDia.setUTCHours(8, 0, 0, 0); const abriu = inicioDia.getTime() + 3 * H; // 8h de Brasília em UTC
  const desde = Math.max(abriu, o.ultimaRecebida ? new Date(o.ultimaRecebida).getTime() : 0);
  if (o.agora.getTime() - desde < horas * H) return false;
  if (o.ultimoReinicio && o.agora.getTime() - new Date(o.ultimoReinicio).getTime() < horas * H) return false; // já reiniciou há pouco
  return true;
}

type Deps = {
  estado: () => Promise<string>;
  webhook: () => Promise<{ ok: boolean; problema: string }>;
  religarWebhook: () => Promise<void>;
  sondar: () => Promise<boolean>;              // consulta real ao WhatsApp respondeu?
  reiniciar: () => Promise<void>;
  recentes: (desdeISO: string) => Promise<Record<string, any>[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  gravar: (d: Record<string, any>) => Promise<boolean>;            // eslint-disable-line @typescript-eslint/no-explicit-any
  ultimaNoSistema: () => Promise<string | null>;
  avisar: (texto: string) => Promise<void>;
};

const iso = (s: number) => new Date(s * 1000).toISOString();

/** uma rodada do vigia (as dependências vêm de fora para dar para testar) */
export async function rodadaVigia(dp: Deps, ant: EstadoVigia | null, agora = new Date(), op: { manual?: boolean } = {}): Promise<EstadoVigia> {
  const ev: EventoVigia[] = []; const marca = (tipo: EventoVigia["tipo"], texto: string) => ev.push({ em: agora.toISOString(), tipo, texto });
  let ultimoReinicio = ant?.ultimoReinicio || null; let sonda: EstadoVigia["sonda"] = "pulada"; let recuperadas = 0;
  const reiniciar = async (motivo: string) => {
    try { await dp.reiniciar(); ultimoReinicio = agora.toISOString(); marca("conserto", "Reiniciei a conexão com o WhatsApp: " + motivo + "."); return true; }
    catch (e) { marca("problema", "Tentei reiniciar a conexão (" + motivo + "), mas o servidor recusou: " + (e as Error).message); return false; }
  };

  let estado = "erro";
  try { estado = await dp.estado(); } catch (e) { marca("problema", "O servidor do WhatsApp (Evolution, na Hostinger) não respondeu: " + (e as Error).message); }

  if (estado === "connecting") {
    // preso em "conectando": reinicia (no máx. a cada 30 min)
    if (!ultimoReinicio || agora.getTime() - new Date(ultimoReinicio).getTime() > 0.5 * H) await reiniciar("estava presa em \"conectando\"");
    else marca("problema", "A conexão continua em \"conectando\" depois de reiniciar.");
  } else if (estado === "close" || estado === "sem_instancia") {
    marca("problema", "O WhatsApp está desconectado do sistema: é preciso ler o QR-code de novo (Configurações ou tela do WhatsApp).");
  } else if (estado === "open") {
    // 2. endereço de entrega
    try {
      const w = await dp.webhook();
      if (!w.ok) { await dp.religarWebhook(); const w2 = await dp.webhook(); marca(w2.ok ? "conserto" : "problema", (w2.ok ? "Consertei a entrega das mensagens: " : "A entrega das mensagens continua com problema: ") + w.problema + "."); }
    } catch (e) { marca("problema", "Não consegui conferir a entrega das mensagens: " + (e as Error).message); }
    // 3. sonda
    let vivo = false;
    try { vivo = await dp.sondar(); } catch { vivo = false; }
    sonda = vivo ? "ok" : "falhou";
    if (!vivo) {
      if (!ultimoReinicio || agora.getTime() - new Date(ultimoReinicio).getTime() > 0.5 * H) await reiniciar("aparecia como conectada, mas não respondia ao WhatsApp");
      else marca("problema", "A conexão continua sem responder ao WhatsApp mesmo depois de reiniciar. Pode ser preciso desconectar e ler o QR-code de novo, ou reiniciar o servidor na Hostinger.");
    }
  }

  // 4. mensagens que ficaram no servidor e não chegaram ao sistema (últimas 24 h, ou desde a última rodada com folga)
  let ultimaServidor: string | null = ant?.ultimaRecebidaServidor || null;
  if (estado === "open" || estado === "connecting") {
    try {
      const desde = new Date(Math.max(agora.getTime() - 24 * H, ant?.em ? new Date(ant.em).getTime() - 2 * H : 0)).toISOString();
      const rs = await dp.recentes(desde);
      for (const r of rs) {
        const ts = Number(r?.messageTimestamp) || 0;
        if (!r?.key?.fromMe && ts && (!ultimaServidor || iso(ts) > ultimaServidor)) ultimaServidor = iso(ts);
        if (await dp.gravar(r)) recuperadas++;
      }
      if (recuperadas) marca("conserto", `Recuperei ${recuperadas} mensagem(ns) que estavam no servidor e não tinham chegado ao sistema (ficam marcadas para a equipe).`);
    } catch (e) { marca("problema", "Não consegui buscar as mensagens no servidor: " + (e as Error).message); }
  }
  const ultimaSistema = await dp.ultimaNoSistema().catch(() => null);

  // 5. silêncio longo em horário comercial (nem o servidor recebeu nada)
  const ultimaRecebida = [ultimaServidor, ultimaSistema].filter(Boolean).sort().pop() || null;
  if (estado === "open" && sonda === "ok" && silencioSuspeito({ agora, ultimaRecebida, ultimoReinicio })) await reiniciar("horário comercial e mais de 1 hora sem receber nenhuma mensagem");
  // verificação pedida pelo titular ("não está chegando"): sem mensagem recebida há 20 min, reinicia (se não reiniciou há menos de 5 min)
  else if (op.manual && (estado === "open" || estado === "connecting") && (!ultimaRecebida || agora.getTime() - new Date(ultimaRecebida).getTime() > 20 * 60e3)
    && (!ultimoReinicio || agora.getTime() - new Date(ultimoReinicio).getTime() > 5 * 60e3)) await reiniciar("verificação pedida no sistema e nenhuma mensagem recebida nos últimos 20 minutos");

  const problemas = ev.filter((x) => x.tipo === "problema");
  const ok = estado === "open" && !problemas.length;
  const resumo = problemas.length ? problemas[problemas.length - 1].texto : ev.length ? ev[ev.length - 1].texto : "Tudo certo: conectado, entrega das mensagens conferida e o WhatsApp respondendo.";
  // avisa o titular de problema sem conserto (no máx. a cada 2 h)
  let ultimoAviso = ant?.ultimoAviso || null;
  if (problemas.length && (!ultimoAviso || agora.getTime() - new Date(ultimoAviso).getTime() > 2 * H)) {
    await dp.avisar("WhatsApp do sistema: " + resumo).catch(() => {}); ultimoAviso = agora.toISOString();
  }
  // histórico: guarda os consertos/problemas e um "ok" quando volta ao normal
  const hist = [...(ant?.historico || [])];
  if (!ev.length && ant && !ant.ok && ok) hist.push({ em: agora.toISOString(), tipo: "ok", texto: "Voltou ao normal." });
  hist.push(...ev);
  return { em: agora.toISOString(), estado, ok, resumo, sonda, ultimaRecebidaServidor: ultimaServidor, ultimaRecebidaSistema: ultimaSistema, ultimoReinicio, ultimoAviso, recuperadas, historico: hist.slice(-40) };
}

/** liga o vigia às peças reais (Evolution, banco) */
export async function vigiar(adm: Adm, ant: EstadoVigia | null, op: { manual?: boolean } = {}): Promise<EstadoVigia> {
  const { INSTANCIA, evo, soFone, ErroWa } = await import("./whatsapp");
  const { gravarMensagem } = await import("./whatsappDb");
  const { enderecoDoSite } = await import("./site");
  const inst = INSTANCIA();
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET || "";
  const urlEntrega = async () => `${await enderecoDoSite()}/api/whatsapp/webhook?s=${encodeURIComponent(segredo)}`;
  return rodadaVigia({
    estado: async () => {
      try { const r = await evo<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${inst}`); return r?.instance?.state || r?.state || "desconhecido"; }
      catch (e) { if (e instanceof ErroWa && (e.message === "NAO_ENCONTRADO" || e.status === 404)) return "sem_instancia"; throw e; }
    },
    webhook: async () => {
      const w = await evo<{ url?: string; enabled?: boolean; events?: string[]; webhook?: { url?: string; enabled?: boolean; events?: string[] } } | null>(`/webhook/find/${inst}`);
      const cfg = w?.webhook || w || {}; const url = String(cfg.url || ""); const esperado = (await urlEntrega()).split("?")[0];
      if (!url) return { ok: false, problema: "estava sem endereço de entrega" };
      if (cfg.enabled === false) return { ok: false, problema: "a entrega estava desligada" };
      if (url.split("?")[0].replace(/\/+$/, "") !== esperado) return { ok: false, problema: "entregava para outro endereço" };
      if (!segredo || new URL(url).searchParams.get("s") !== segredo) return { ok: false, problema: "a senha do endereço não conferia" };
      if (cfg.events?.length && !cfg.events.includes("MESSAGES_UPSERT")) return { ok: false, problema: "o evento de mensagens novas estava desligado" };
      return { ok: true, problema: "" };
    },
    religarWebhook: async () => {
      if (!segredo) throw new Error("falta WHATSAPP_WEBHOOK_SECRET na Vercel");
      await evo(`/webhook/set/${inst}`, "POST", { webhook: { enabled: true, url: await urlEntrega(), byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"] } });
    },
    sondar: async () => {
      // pergunta ao WhatsApp se o próprio número do escritório existe: só responde se a conexão estiver viva de verdade
      const l = await evo<{ ownerJid?: string; owner?: string; instance?: { owner?: string } }[]>(`/instance/fetchInstances?instanceName=${encodeURIComponent(inst)}`).catch(() => []);
      const dono = soFone((Array.isArray(l) ? l[0] : null)?.ownerJid || (Array.isArray(l) ? l[0] : null)?.owner || process.env.WHATSAPP_NUMERO || "");
      if (!dono) return true; // sem número para testar: não arrisca reiniciar
      const r = await Promise.race([
        evo<{ exists?: boolean }[]>(`/chat/whatsappNumbers/${inst}`, "POST", { numbers: [dono] }),
        new Promise<null>((ok) => setTimeout(() => ok(null), 25000)),
      ]);
      return Array.isArray(r) && r.length > 0;
    },
    reiniciar: async () => {
      let r: { error?: boolean; message?: string } | null;
      try { r = await evo(`/instance/restart/${inst}`, "POST"); }
      catch (e) { if (e instanceof ErroWa && [404, 405].includes(e.status)) r = await evo(`/instance/restart/${inst}`, "PUT"); else throw e; }
      if (r?.error) throw new Error(String(r.message || "erro ao reiniciar").slice(0, 200)); // a Evolution responde 200 com {error: true}
    },
    recentes: async (desde) => {
      const out: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let page = 1; page <= 6; page++) {
        const r = await evo<{ messages?: { records?: Record<string, any>[]; pages?: number } }>(`/chat/findMessages/${inst}`, "POST", // eslint-disable-line @typescript-eslint/no-explicit-any
          { where: { messageTimestamp: { gte: desde, lte: new Date().toISOString() } }, page, offset: 100 });
        const recs = r?.messages?.records || []; out.push(...recs);
        if (recs.length < 100 || page >= (r?.messages?.pages || 1)) break;
      }
      return out;
    },
    gravar: async (d) => !!(await gravarMensagem(adm, d, { recuperada: true }).catch(() => null)),
    ultimaNoSistema: async () => {
      const { data } = await adm.from("wa_mensagens").select("em").eq("de_mim", false).order("em", { ascending: false }).limit(1);
      return data?.[0]?.em || null;
    },
    avisar: async (texto) => {
      const { data: tit } = await adm.from("profiles").select("id").eq("papel", "titular").eq("ativo", true);
      if (tit?.length) await adm.from("notificacoes").insert(tit.map((t: { id: string }) => ({ para: t.id, de: null, tipo: "whatsapp", texto: texto.slice(0, 500) })));
    },
  }, ant, new Date(), op);
}
