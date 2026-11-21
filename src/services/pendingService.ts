import type { NavSection } from '../components/layout/AppLayout';

export type PendingSeverity = 'critico' | 'atencao' | 'info';
export interface PendingItem {
  id: string;
  severity: PendingSeverity;
  modulo: NavSection;
  titulo: string;
  detalhe: string;
  acao: { label: string; section: NavSection };
  /** ISO date used only to order items inside a severity (oldest first). */
  data: string;
}

/** Already-fetched, minimal shapes (the component maps Firestore docs into these). */
export interface PendingData {
  hoje: string; // YYYY-MM-DD
  payables: { id: string; status: string; vencimento: string; valor: number; fornecedor: { nome: string } }[];
  nfes: { id: string; status: string; emitente: { nome: string }; numero?: string; emitidaEm?: string }[];
  stock: { id: string; itemName: string; currentBalance: number; minStock?: number; criticalStock?: number }[];
  certAlerts: { id: string; workerName: string; nrCode: string; daysRemaining: number }[]; // certs with an expiry date; >30 days ignored here
  assets: { id: string; code: string; description: string; alert?: string }[];
  workOrders: { id: string; orderNumber: string; title: string; status: string; scheduledEndDate?: string }[];
  completedStatusIds: string[];
  proposals: { id: string; code: string; clientName: string; status: string; updatedAt?: string }[];
}

/** Today's date (YYYY-MM-DD) in São Paulo, not UTC (UTC flips the day at 21h BRT). */
export const todaySaoPaulo = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);

const RANK: Record<PendingSeverity, number> = { critico: 0, atencao: 1, info: 2 };
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const addDays = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

export function buildPendingItems(d: PendingData): PendingItem[] {
  const out: PendingItem[] = [];
  const in7 = addDays(d.hoje, 7);

  for (const p of d.payables) {
    if (p.status !== 'aberto' || p.vencimento > in7) continue;
    const late = p.vencimento < d.hoje;
    out.push({
      id: `pay:${p.id}`, severity: late ? 'critico' : 'atencao', modulo: 'financeiro-pagar',
      titulo: late ? 'Conta atrasada' : 'Conta vence em breve',
      detalhe: `${p.fornecedor?.nome ?? ''} · ${brl(p.valor)} · venc. ${p.vencimento.split('-').reverse().join('/')}`,
      acao: { label: 'Ver contas', section: 'financeiro-pagar' }, data: p.vencimento,
    });
  }

  for (const n of d.nfes) {
    if (n.status !== 'aguardando_classificacao' && n.status !== 'erro_classificacao') continue;
    const err = n.status === 'erro_classificacao';
    out.push({
      id: `nfe:${n.id}`, severity: err ? 'critico' : 'atencao', modulo: 'financeiro-notas',
      titulo: err ? 'Erro ao classificar nota' : 'Falta informar a obra',
      detalhe: `NF-e ${n.numero ?? ''} · ${n.emitente?.nome ?? ''}`,
      acao: { label: 'Abrir nota', section: 'financeiro-notas' }, data: n.emitidaEm?.slice(0, 10) ?? d.hoje,
    });
  }

  for (const s of d.stock) {
    const crit = s.criticalStock !== undefined && s.currentBalance <= s.criticalStock;
    if (!crit && !(s.minStock !== undefined && s.currentBalance <= s.minStock)) continue;
    out.push({
      id: `stk:${s.id}`, severity: crit ? 'critico' : 'atencao', modulo: 'estoque',
      titulo: crit ? 'Estoque crítico' : 'Estoque no mínimo',
      detalhe: `${s.itemName} · saldo ${s.currentBalance}`,
      acao: { label: 'Ver estoque', section: 'estoque' }, data: d.hoje,
    });
  }

  for (const c of d.certAlerts) {
    if (c.daysRemaining > 30) continue;
    const late = c.daysRemaining < 0;
    out.push({
      id: `cert:${c.id}`, severity: late ? 'critico' : 'atencao', modulo: 'obras',
      titulo: `${c.nrCode} ${late ? 'vencida' : 'vencendo'}`,
      detalhe: `${c.workerName} · ${late ? `há ${-c.daysRemaining} dia(s)` : `em ${c.daysRemaining} dia(s)`}`,
      acao: { label: 'Ver equipe', section: 'obras' }, data: addDays(d.hoje, c.daysRemaining),
    });
  }

  for (const a of d.assets) {
    if (a.alert !== 'VENCIDO' && a.alert !== 'A_VENCER') continue;
    const late = a.alert === 'VENCIDO';
    out.push({
      id: `asset:${a.id}`, severity: late ? 'critico' : 'atencao', modulo: 'bens-manutencoes',
      titulo: late ? 'Manutenção/calibração vencida' : 'Manutenção/calibração a vencer',
      detalhe: `${a.code} · ${a.description}`,
      acao: { label: 'Ver bens', section: 'bens-manutencoes' }, data: d.hoje,
    });
  }

  for (const o of d.workOrders) {
    if (!o.scheduledEndDate || o.scheduledEndDate >= d.hoje || d.completedStatusIds.includes(o.status)) continue;
    out.push({
      id: `wo:${o.id}`, severity: 'atencao', modulo: 'ordens',
      titulo: 'Ordem de serviço atrasada',
      detalhe: `${o.orderNumber} · ${o.title}`,
      acao: { label: 'Ver ordens', section: 'ordens' }, data: o.scheduledEndDate,
    });
  }

  const cutoff = addDays(d.hoje, -7);
  for (const p of d.proposals) {
    if ((p.status !== 'enviada' && p.status !== 'negociacao') || !p.updatedAt || p.updatedAt.slice(0, 10) >= cutoff) continue;
    out.push({
      id: `prop:${p.id}`, severity: 'info', modulo: 'comercial-painel',
      titulo: 'Proposta sem retorno há mais de 7 dias',
      detalhe: `${p.code} · ${p.clientName}`,
      acao: { label: 'Ver propostas', section: 'comercial-painel' }, data: p.updatedAt.slice(0, 10),
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.data.localeCompare(b.data));
}
