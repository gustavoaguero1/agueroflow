import { XMLParser } from 'fast-xml-parser';

export type NfeItem = { n: number; codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valorUnitario: number; valorTotal: number; ean?: string };
export type ParsedNfe = {
  chave: string; numero: string; serie: string; modelo: string; emitidaEm: string;
  emitente: { cnpj: string; nome: string; uf?: string };
  destinatario: { cnpj: string; nome: string };
  valorTotal: number; valorProdutos: number; valorFrete: number; valorIcms: number; valorIpi: number;
  itens: NfeItem[];
  duplicatas: { numero: string; vencimento: string; valor: number }[];
  naturezaOperacao: string;
};

// Codes/ids stay strings (leading zeros matter); numbers are converted explicitly.
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true,
  parseTagValue: false, processEntities: false, isArray: (name) => name === 'det' || name === 'dup',
});
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const money = (v: unknown) => Math.round(num(v) * 100) / 100;
const INVALID = 'XML não é uma NF-e válida';
const str = (v: unknown) => (v == null ? '' : String(v));

export function parseNfeXml(xml: string): ParsedNfe {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(INVALID);
  const doc = parser.parse(xml);
  const inf = (doc?.nfeProc?.NFe ?? doc?.NFe)?.infNFe;
  if (!inf) throw new Error(INVALID);
  const { ide = {}, emit = {}, dest = {}, total = {}, cobr = {} } = inf;
  const t = total.ICMSTot ?? {};
  const chave = str(inf['@Id']).replace(/^NFe/, '');
  if (!/^\d{44}$/.test(chave) || !Number.isFinite(Number(t.vNF)) || t.vNF == null || t.vNF === '') throw new Error(INVALID);
  return {
    chave,
    numero: str(ide.nNF), serie: str(ide.serie), modelo: str(ide.mod), emitidaEm: str(ide.dhEmi ?? ide.dEmi),
    emitente: { cnpj: str(emit.CNPJ ?? emit.CPF), nome: str(emit.xNome), ...(emit.enderEmit?.UF && { uf: str(emit.enderEmit.UF) }) },
    destinatario: { cnpj: str(dest.CNPJ ?? dest.CPF), nome: str(dest.xNome) },
    valorTotal: money(t.vNF), valorProdutos: money(t.vProd), valorFrete: money(t.vFrete), valorIcms: money(t.vICMS), valorIpi: money(t.vIPI),
    itens: (inf.det ?? []).map((d: any): NfeItem => {
      const p = d.prod ?? {};
      const ean = str(p.cEAN);
      return {
        n: num(d['@nItem']), codigo: str(p.cProd), descricao: str(p.xProd), ncm: str(p.NCM), cfop: str(p.CFOP), unidade: str(p.uCom),
        quantidade: num(p.qCom), valorUnitario: num(p.vUnCom), valorTotal: money(p.vProd),
        ...(/^\d{8,14}$/.test(ean) && { ean }), // "SEM GTIN" is not an EAN
      };
    }),
    duplicatas: (cobr.dup ?? []).map((d: any) => ({ numero: str(d.nDup), vencimento: str(d.dVenc), valor: money(d.vDup) })),
    naturezaOperacao: str(ide.natOp),
  };
}
