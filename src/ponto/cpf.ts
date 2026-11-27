// CPF: o identificador do trabalhador no ponto (Portaria 671).
export const onlyDigitsCpf = (s: string) => String(s ?? '').replace(/\D/g, '');

export function isValidCpf(s: string): boolean {
  const d = onlyDigitsCpf(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
