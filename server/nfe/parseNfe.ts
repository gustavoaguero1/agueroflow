import { XMLParser } from 'fast-xml-parser';

export type NfeImpostos = { vICMS: number; vICMSST: number; vIPI: number; vPIS: number; vCOFINS: number; pICMS?: number; pIPI?: number };
export type NfeItem = {
  n: number; codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valorUnitario: number; valorTotal: number; ean?: string;
  vFrete: number; vSeg: number; vDesc: number; vOutro: number; impostos: NfeImpostos;
  /** Acquisition cost of the line: vProd + vFrete + vSeg + vOutro + vICMSST + vIPI − vDesc. */
  custoTotal: number;
};
export type ParsedNfe = {
  chave: string; numero: string; serie: string; modelo: string; emitidaEm: string;
  emitente: { cnpj: string; nome: string; uf?: string };
  destinatario: { cnpj: string; nome: string };
  valorTotal: number; valorProdutos: number; valorFrete: number; valorIcms: number; valorIpi: number;
  valorDesconto: number; valorSeguro: number; valorOutros: number; valorSt: number; valorPis: number; valorCofins: number;
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
/** The single tax group inside a wrapper (ICMS00/10/…/ICMSSN*, PISAliq/PISOutr/…, IPITrib/IPINT). */
const group = (w: any): any => (w && typeof w === 'object' ? Object.entries(w).find(([k, v]) => !k.startsWith('@') && v && typeof v === 'object')?.[1] ?? {} : {});
const rate = (v: unknown) => (v == null || v === '' ? undefined : num(v));

function impostos(imp: any = {}): NfeImpostos {
  const icms = group(imp.ICMS), pis = group(imp.PIS), cofins = group(imp.COFINS);
  const ipi = imp.IPI?.IPITrib ?? {};
  const pICMS = rate(icms.pICMS), pIPI = rate(ipi.pIPI);
  return {
    vICMS: money(icms.vICMS), vICMSST: money(icms.vICMSST), vIPI: money(ipi.vIPI), vPIS: money(pis.vPIS), vCOFINS: money(cofins.vCOFINS),
    ...(pICMS !== undefined && { pICMS }), ...(pIPI !== undefined && { pIPI }),
  };
}

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
    valorDesconto: money(t.vDesc), valorSeguro: money(t.vSeg), valorOutros: money(t.vOutro), valorSt: money(t.vST),
    valorPis: money(t.vPIS), valorCofins: money(t.vCOFINS),
    itens: (inf.det ?? []).map((d: any): NfeItem => {
      const p = d.prod ?? {};
      const ean = str(p.cEAN);
      const imp = impostos(d.imposto);
      const [vProd, vFrete, vSeg, vDesc, vOutro] = [p.vProd, p.vFrete, p.vSeg, p.vDesc, p.vOutro].map(money);
      return {
        n: num(d['@nItem']), codigo: str(p.cProd), descricao: str(p.xProd), ncm: str(p.NCM), cfop: str(p.CFOP), unidade: str(p.uCom),
        quantidade: num(p.qCom), valorUnitario: num(p.vUnCom), valorTotal: vProd,
        ...(/^\d{8,14}$/.test(ean) && { ean }), // "SEM GTIN" is not an EAN
        vFrete, vSeg, vDesc, vOutro, impostos: imp,
        custoTotal: money(vProd + vFrete + vSeg + vOutro + imp.vICMSST + imp.vIPI - vDesc),
      };
    }),
    duplicatas: (cobr.dup ?? []).map((d: any) => ({ numero: str(d.nDup), vencimento: str(d.dVenc), valor: money(d.vDup) })),
    naturezaOperacao: str(ide.natOp),
  };
}
