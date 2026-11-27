// Arquivo Fonte de Dados (AFD), leiaute 004 da Portaria 671 para REP-P.
// Ver docs/superpowers/plans/2026-11-27-ponto-nucleo.md (Task 3) para as escolhas onde o leiaute é omisso.
import { createHash } from 'node:crypto';

const CRLF = '\r\n';

const semAcento = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ');
/** Campo alfanumérico: alinhado à esquerda, espaços à direita. */
const A = (s: string, n: number) => semAcento(s).slice(0, n).padEnd(n, ' ');
/** Campo numérico: zeros à esquerda. */
const N = (v: string | number, n: number) => String(v ?? '').replace(/\D/g, '').slice(-n).padStart(n, '0');

/** CRC-16/KERMIT (CCITT-TRUE): poly 0x1021 refletido (0x8408), init 0, sem xorout. */
export function crc16Kermit(s: string): string {
  let crc = 0;
  for (const byte of Buffer.from(s, 'latin1')) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** "AAAA-MM-ddThh:mm:00ZZZZZ", mantendo o horário local e o fuso do próprio ISO. */
export function dhAfd(iso: string): string {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`data-hora inválida: ${iso}`);
  const tz = m[4] === 'Z' ? '+0000' : m[4].replace(':', '');
  return `${m[1]}T${m[2]}:${m[3]}:00${tz}`;
}

export function camposTipo7(r: { nsr: number; dataHora: string; cpf: string; gravadoEm: string; coletor: '01'; offline: boolean }): string {
  return N(r.nsr, 9) + '7' + dhAfd(r.dataHora) + N(r.cpf, 12) + dhAfd(r.gravadoEm) + N(r.coletor, 2) + (r.offline ? '1' : '0');
}

export function hashTipo7(campos: string, prevHash: string | null): string {
  return createHash('sha256').update(campos + (prevHash ?? ''), 'latin1').digest('hex');
}

export const linhaTipo7 = (campos: string, hash: string) => campos + hash;

const comCrc = (s: string) => s + crc16Kermit(s);

export function linhaTipo2(r: { nsr: number; gravadoEm: string; cpfResp: string; cnpj: string; razaoSocial: string; local: string }): string {
  return comCrc(N(r.nsr, 9) + '2' + dhAfd(r.gravadoEm) + N(r.cpfResp, 14) + '1' + A(N(r.cnpj, 14), 14) + N('', 14) + A(r.razaoSocial, 150) + A(r.local, 100));
}

export function linhaTipo5(r: { nsr: number; gravadoEm: string; operacao: 'I' | 'A' | 'E'; cpf: string; nome: string; cpfResp: string }): string {
  return comCrc(N(r.nsr, 9) + '5' + dhAfd(r.gravadoEm) + r.operacao + N(r.cpf, 12) + A(r.nome, 52) + A('', 4) + N(r.cpfResp, 11));
}

export function gerarAfd(p: {
  cnpj: string; razaoSocial: string; inpi: string; inicio: string; fim: string; geradoEm: string; desenvolvedorCnpj: string;
  linhas: { nsr: number; tipo: 2 | 5 | 7; linha: string }[];
}): string {
  const header = comCrc(
    N(0, 9) + '1' + '1' + A(N(p.cnpj, 14), 14) + N('', 14) + A(p.razaoSocial, 150) + N(p.inpi, 17)
      + p.inicio.slice(0, 10) + p.fim.slice(0, 10) + dhAfd(p.geradoEm) + '004' + '1' + A(N(p.desenvolvedorCnpj, 14), 14) + A('', 30),
  );
  const ordenadas = [...p.linhas].sort((a, b) => a.nsr - b.nsr);
  const conta = (t: number) => N(ordenadas.filter((l) => l.tipo === t).length, 9);
  const trailer = '999999999' + conta(2) + conta(3) + conta(4) + conta(5) + conta(6) + conta(7) + '9';
  const assinatura = 'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' ');
  return [header, ...ordenadas.map((l) => l.linha), trailer, assinatura].join(CRLF) + CRLF;
}
