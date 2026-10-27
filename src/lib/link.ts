/** só deixa passar endereços http(s) — bloqueia "javascript:", "data:" e outros esquemas vindos de dados externos ou digitados */
export const linkSeguro = (u?: string | null): string | undefined => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : undefined);
