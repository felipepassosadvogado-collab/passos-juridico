/** se passar do limite, guarda o começo (inicial) e sobretudo o fim (atos mais recentes: laudo, sentença) */
export function encurtar(t: string, max: number) {
  if (t.length <= max) return t;
  const ini = Math.floor(max * 0.25), fim = max - ini;
  return t.slice(0, ini) + "\n\n[… trecho do meio omitido por tamanho: " + Math.round((t.length - max) / 1000) + " mil caracteres …]\n\n" + t.slice(t.length - fim);
}
