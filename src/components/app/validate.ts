export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const phoneOk = (v: string) => /^\+?[0-9][0-9 ()/-]{5,19}$/.test(v.trim());
