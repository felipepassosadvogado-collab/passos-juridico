"use client";
// Cópia de segurança completa, baixada no computador do titular:
// 1) banco de dados: todas as tabelas em JSON (para restaurar) e CSV (para abrir no Excel);
// 2) documentos: todos os arquivos anexados, organizados por cliente, em partes de até ~400 MB.
// Os arquivos guardados no Supabase (Storage) não entram em nenhum backup automático do Supabase.
import { useRef, useState } from "react";
import JSZip from "jszip";
import { useDados, msgErro } from "@/lib/dados";
import { dataHoraBR, nomeBonito } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { baixar } from "./ui";

const TABELAS = ["clientes", "processos", "casos", "tarefas", "publicacoes", "avisos_cliente", "documentos", "eventos", "notificacoes",
  "mensagens", "mensagens_lidas", "profiles", "reus", "config", "acessos"];
const PARTE = 400 * 1024 * 1024;

type Doc = { id: string; cliente_id: string | null; tarefa_id: string | null; tipo: string | null; nome: string; caminho: string; tamanho: number | null; em: string };
type Est = { fase: string; feitos: number; total: number; bytes: number; erros: string[] };

const limpo = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "sem-nome";
const mb = (b: number) => (b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";

function csv(linhas: Record<string, unknown>[]) {
  if (!linhas.length) return "";
  const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const esc = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return '"' + s.replace(/"/g, '""') + '"'; };
  return "﻿" + [cols.map(esc).join(";"), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(";"))].join("\r\n");
}

export function CopiaSeguranca() {
  const { sb, config, aviso, clientes, tarefas, processos, casos } = useDados();
  const [est, setEst] = useState<Est | null>(null); const [rodando, setRodando] = useState(false); const parar = useRef(false);
  const ult = (config.backup || {}) as { banco?: string; docs?: string; docsQtd?: number; docsBytes?: number };
  const dias = (iso?: string) => (iso ? diferencaDias(hojeBR(), iso.slice(0, 10)) : null);
  const velho = (iso?: string) => { const d = dias(iso); return d == null || d > 7; };

  const todas = async (t: string) => {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from(t).select("*").range(i, i + 999);
      if (error) throw new Error(t + ": " + msgErro(error));
      out.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return out;
  };
  const marcar = async (campos: Record<string, unknown>) => {
    await sb.from("config").upsert({ chave: "backup", valor: { ...ult, ...campos } }, { onConflict: "chave" });
  };

  const banco = async () => {
    setRodando(true); const e: Est = { fase: "Lendo o banco de dados…", feitos: 0, total: TABELAS.length, bytes: 0, erros: [] }; setEst({ ...e });
    try {
      const zip = new JSZip(); const resumo: Record<string, number> = {};
      for (const t of TABELAS) {
        e.fase = "Lendo " + t + "…"; setEst({ ...e });
        try { const l = await todas(t); resumo[t] = l.length; zip.file("json/" + t + ".json", JSON.stringify(l)); zip.file("excel/" + t + ".csv", csv(l)); }
        catch (x) { e.erros.push((x as Error).message); }
        e.feitos++; setEst({ ...e });
      }
      zip.file("LEIA-ME.txt", [`Cópia de segurança do banco de dados — Passos Advocacia`, `Gerada em ${dataHoraBR(new Date().toISOString())}`, "",
        "Pasta json: os dados completos, para restaurar o sistema.", "Pasta excel: as mesmas tabelas em CSV (abre no Excel).", "",
        ...Object.entries(resumo).map(([t, n]) => `${t}: ${n} registro(s)`), ...(e.erros.length ? ["", "Não foi possível ler:", ...e.erros] : [])].join("\r\n"));
      e.fase = "Compactando…"; setEst({ ...e });
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      baixar(`backup-banco-${hojeBR()}.zip`, blob);
      await marcar({ banco: new Date().toISOString() });
      e.fase = `Banco de dados baixado (${mb(blob.size)}).`; setEst({ ...e }); aviso("Backup do banco de dados baixado. Guarde o arquivo em local seguro.");
    } catch (x) { e.fase = "Falhou: " + (x as Error).message; setEst({ ...e }); }
    finally { setRodando(false); }
  };

  /** pasta de cada arquivo: o cliente (pela ficha, pela tarefa ou pelo atendimento) */
  const pastaDe = (d: Doc) => {
    let cli = d.cliente_id ? clientes.get(d.cliente_id)?.nome : "";
    if (!cli && d.tarefa_id) { const t = tarefas.get(d.tarefa_id); const p = t?.processo_numero ? processos.get(t.processo_numero) : undefined; const c = t?.caso_id ? casos.get(t.caso_id) : undefined;
      cli = p?.cliente_nome || c?.nome || ""; }
    return "Clientes/" + limpo(nomeBonito(cli || "Sem cliente")) + (d.tarefa_id ? "/Pecas e anexos de tarefas" : "");
  };

  const documentos = async () => {
    setRodando(true); parar.current = false;
    const e: Est = { fase: "Listando os documentos…", feitos: 0, total: 0, bytes: 0, erros: [] }; setEst({ ...e });
    try {
      const docs = (await todas("documentos")) as unknown as Doc[];
      const chat = ((await todas("mensagens")) as { anexo?: string | null; anexo_nome?: string | null; em: string }[]).filter((m) => m.anexo);
      const itens = [...docs.map((d) => ({ caminho: d.caminho, pasta: pastaDe(d), nome: d.nome, tam: d.tamanho || 0, info: [d.tipo || "", dataHoraBR(d.em)] })),
        ...chat.map((m) => ({ caminho: m.anexo!, pasta: "Chat", nome: m.anexo_nome || m.anexo!.split("/").pop() || "anexo", tam: 0, info: ["chat", dataHoraBR(m.em)] }))];
      e.total = itens.length; setEst({ ...e });
      if (!itens.length) { e.fase = "Nenhum documento anexado ainda."; setEst({ ...e }); return; }
      // divide em partes pelo tamanho conhecido (para não estourar a memória do navegador)
      const partes: typeof itens[] = [[]]; let acc = 0;
      for (const it of itens) { const t = it.tam || 2 * 1024 * 1024; if (acc + t > PARTE && partes[partes.length - 1].length) { partes.push([]); acc = 0; } partes[partes.length - 1].push(it); acc += t; }
      const indice: string[][] = [["Parte", "Pasta", "Arquivo", "Tipo", "Enviado em", "Caminho no sistema"]];
      for (let pi = 0; pi < partes.length; pi++) {
        if (parar.current) break;
        const zip = new JSZip(); const usados = new Set<string>(); const fila = [...partes[pi]];
        const um = async () => {
          for (let it = fila.shift(); it; it = fila.shift()) {
            if (parar.current) return;
            const { data, error } = await sb.storage.from("documentos").download(it.caminho);
            if (error || !data) e.erros.push(it.pasta + "/" + it.nome);
            else {
              let nome = limpo(it.nome); const base = nome.replace(/(\.[^.]+)?$/, ""), ext = nome.slice(base.length); let k = 2;
              while (usados.has(it.pasta + "/" + nome)) nome = `${base} (${k++})${ext}`;
              usados.add(it.pasta + "/" + nome); zip.file(it.pasta + "/" + nome, data); e.bytes += data.size;
              indice.push([String(pi + 1), it.pasta, nome, it.info[0], it.info[1], it.caminho]);
            }
            e.feitos++; e.fase = `Baixando documentos${partes.length > 1 ? ` (parte ${pi + 1} de ${partes.length})` : ""}…`; setEst({ ...e });
          }
        };
        await Promise.all([um(), um(), um(), um()]);
        if (pi === partes.length - 1 || parar.current) zip.file("INDICE.csv", "﻿" + indice.map((l) => l.map((c) => '"' + c.replace(/"/g, '""') + '"').join(";")).join("\r\n"));
        e.fase = "Compactando…"; setEst({ ...e });
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        baixar(`backup-documentos-${hojeBR()}${partes.length > 1 ? `-parte-${pi + 1}-de-${partes.length}` : ""}.zip`, blob);
      }
      if (parar.current) { e.fase = "Interrompido. As partes já baixadas estão completas."; setEst({ ...e }); return; }
      await marcar({ docs: new Date().toISOString(), docsQtd: e.feitos - e.erros.length, docsBytes: e.bytes });
      e.fase = `Documentos baixados: ${e.feitos - e.erros.length} arquivo(s), ${mb(e.bytes)}.`; setEst({ ...e }); aviso("Backup dos documentos baixado. Guarde em local seguro.");
    } catch (x) { e.fase = "Falhou: " + (x as Error).message; setEst({ ...e }); }
    finally { setRodando(false); }
  };

  return (
    <section className="panel"><div className="ph"><h3>Cópia de segurança</h3></div>
      <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "76ch" }}>
        <p style={{ margin: 0 }}>Baixa para o seu computador uma cópia completa do sistema. Guarde os arquivos num lugar seguro (HD externo, Google Drive ou OneDrive) e faça de novo uma vez por semana. Os documentos anexados não entram em nenhum backup automático do Supabase: esta cópia é a única garantia deles.</p>
        <div className="bk-linhas">
          <div className="bk-l">
            <div><strong>Banco de dados</strong><div className="muted s">clientes, processos, atendimentos, tarefas, publicações, avisos, histórico e chat (JSON e Excel)</div>
              <div className={"s " + (velho(ult.banco) ? "late-t" : "muted")}>{ult.banco ? "Último backup: " + dataHoraBR(ult.banco) + (velho(ult.banco) ? ` (há ${dias(ult.banco)} dias)` : "") : "Nenhum backup feito ainda"}</div></div>
            <button className="btn primary" disabled={rodando} onClick={banco}>Baixar banco de dados</button>
          </div>
          <div className="bk-l">
            <div><strong>Documentos</strong><div className="muted s">RG, comprovantes, procurações, peças e anexos, em pastas por cliente (arquivos grandes saem em partes de até 400 MB)</div>
              <div className={"s " + (velho(ult.docs) ? "late-t" : "muted")}>{ult.docs ? `Último backup: ${dataHoraBR(ult.docs)}${ult.docsQtd != null ? ` · ${ult.docsQtd} arquivos, ${mb(ult.docsBytes || 0)}` : ""}${velho(ult.docs) ? ` (há ${dias(ult.docs)} dias)` : ""}` : "Nenhum backup feito ainda"}</div></div>
            {rodando && est?.total && est.fase.startsWith("Baixando") ? <button className="btn" onClick={() => { parar.current = true; }}>Parar</button>
              : <button className="btn primary" disabled={rodando} onClick={documentos}>Baixar documentos</button>}
          </div>
        </div>
        {est && <div className={"banner" + (est.fase.startsWith("Falhou") ? " erro" : "")}>{est.fase}{est.total > 0 && rodando ? ` ${est.feitos} de ${est.total}` + (est.bytes ? ` · ${mb(est.bytes)}` : "") : ""}
          {est.erros.length > 0 && <div className="s" style={{ marginTop: 4 }}>Não foi possível baixar {est.erros.length}: {est.erros.slice(0, 5).join(", ")}{est.erros.length > 5 ? "…" : ""}</div>}</div>}
        <div className="muted s">O navegador pode pedir permissão para baixar vários arquivos: clique em “Permitir”. Mantenha esta tela aberta até terminar.</div>
      </div>
    </section>
  );
}
