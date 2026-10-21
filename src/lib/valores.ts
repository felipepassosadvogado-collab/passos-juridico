// Valor da causa e honorários contratuais (percentual sobre o valor da causa).
export const PCT_PADRAO = 30;
export const pctPadrao = (config: Record<string, any>) => { const v = Number(config?.geral?.honorariosPct); return isFinite(v) && v > 0 ? v : PCT_PADRAO; };
export const honorarios = (valor?: number | null, pct?: number | null) => (valor && pct ? Math.round(valor * pct) / 100 : 0);
