"use client";
import { PCT_PADRAO } from "@/lib/valores";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataHoraBR } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { BotaoDjen } from "@/components/djen";
import { CopiaSeguranca } from "@/components/backup";
import { PainelConexao } from "@/components/whatsapp";
import { baixar } from "@/components/ui";

export default function Configuracoes() {
  const { config, titular, sb, aviso, processos, clientes, tarefas, casos, avisos } = useDados();
  const g = config.geral || {}; const dj = config.djen || {};
  const [url, setUrl] = useState(g.atendeUrl || ""); const [pct, setPct] = useState(String(g.honorariosPct ?? PCT_PADRAO));
  if (!titular) return <div className="empty">As configurações são do titular do escritório.</div>;
  const salvarGeral = async (campos: Record<string, unknown>, ok: string) => {
    const { error } = await sb.from("config").upsert({ chave: "geral", valor: { ...g, ...campos } }, { onConflict: "chave" });
    if (error) aviso(msgErro(error)); else aviso(ok);
  };
  return (
    <>
      <div className="head"><div><h2>Configurações</h2><div className="sub">DJEN, Claude, Atende Direito e cópia de segurança</div></div></div>
      <section className="panel"><div className="ph"><h3>Busca no DJEN</h3><BotaoDjen rotulo="Buscar agora" /></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "72ch" }}>
          <div>OAB/SC 58.547 · busca automática às 7h, 12h e 17h dos dias úteis, feita pelo servidor em São Paulo.</div>
          <div className="muted">Última busca: {dj.ultimaBusca ? dataHoraBR(dj.ultimaBusca) + (dj.origem === "manual" ? " (manual)" : " (automática)") : "ainda não houve"}{dj.ultimaQtd != null ? ` · ${dj.ultimaQtd} para a caixa` : ""}{dj.ultimaData ? ` · publicações até ${dj.ultimaData.split("-").reverse().join("/")}` : ""}</div>
          {dj.ultimoErro && <div className="banner erro">A última tentativa falhou em {dataHoraBR(dj.ultimoErroEm)}: {dj.ultimoErro}.</div>}
        </div></section>
      <section className="panel"><div className="ph"><h3>Análise com Claude</h3></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "72ch" }}>
          <label className="chk" style={{ fontWeight: 500 }}><input type="checkbox" checked={g.analiseAutomatica !== false} onChange={(e) => salvarGeral({ analiseAutomatica: e.target.checked }, e.target.checked ? "As publicações novas serão analisadas sozinhas." : "Análise automática desligada.")} />
            Analisar sozinho cada publicação nova que chegar do DJEN</label>
          <div className="muted" style={{ fontSize: 13 }}>O Claude lê o ato, sugere a tarefa, o prazo em dias úteis e a fase, e já marca para avisar o cliente quando houver perícia, audiência ou coleta. Quem decide continua sendo a equipe. Usa a chave ANTHROPIC_API_KEY cadastrada na Vercel.</div>
        </div></section>
      <section className="panel"><div className="ph"><h3>Honorários contratuais</h3></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "72ch" }}>
          <p style={{ margin: 0 }}>Percentual padrão sobre o valor da causa, usado no CRM e na ficha quando o processo não tem um percentual próprio.</p>
          <div className="tools"><input style={{ width: 110 }} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /><span>%</span>
            <button className="btn primary" onClick={() => { const v = parseFloat(pct.replace(",", ".")); if (!(v > 0 && v <= 100)) { aviso("Informe um percentual entre 0 e 100."); return; } salvarGeral({ honorariosPct: v }, "Percentual salvo."); }}>Salvar</button></div>
        </div></section>
      <section className="panel"><div className="ph"><h3>Atende Direito</h3></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, maxWidth: "70ch" }}>Endereço que o botão “Abrir no Atende Direito” abre a partir de um aviso ao cliente. Pode usar {"{cpf}"}, {"{nome}"}, {"{telefone}"} e {"{processo}"}, que o sistema troca pelos dados do cliente.</p>
          <div className="tools"><input style={{ flex: 1, minWidth: 240 }} value={url} placeholder="Ex.: https://seusite.com.br/clientes?cpf={cpf}" onChange={(e) => setUrl(e.target.value)} />
            <button className="btn primary" onClick={() => { const v = url.trim(); if (v && !/^https:\/\//.test(v)) { aviso("Use um endereço que comece com https://"); return; } salvarGeral({ atendeUrl: v }, "Endereço salvo."); }}>Salvar</button></div>
        </div></section>
      <section className="panel"><div className="ph"><h3>WhatsApp do escritório</h3><span className="muted" style={{ fontSize: 12.5 }}>conexão pelo QR-code (aparelhos conectados)</span></div>
        <div className="pb"><PainelConexao /></div></section>
      <CopiaSeguranca />
      <section className="panel"><div className="ph"><h3>Como o prazo é calculado</h3></div>
        <div className="pb" style={{ maxWidth: "70ch", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0 }}>Intimação pelo eproc: ciência tácita no 10º dia corrido após a disponibilização (prorrogada para o dia útil seguinte), e o prazo começa no dia útil seguinte.</p>
          <p style={{ margin: 0 }}>Publicação no DJEN: considera-se publicada no primeiro dia útil após a disponibilização, e o prazo começa no dia útil seguinte.</p>
          <p style={{ margin: 0 }} className="muted">Conta só dias úteis, pula os feriados nacionais e da Justiça Federal (Lei 5.010/66) de 2026 a 2028 e a suspensão de 20/12 a 20/01. Feriados locais e suspensões por portaria não entram: confira sempre a data sugerida.</p>
        </div></section>
    </>
  );
}
