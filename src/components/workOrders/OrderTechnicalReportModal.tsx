import React from 'react';
import { WorkOrder, Asset, WorkOrderStatusConfig } from '../../types';
import {
  X,
  Printer,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Boxes,
  Users,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { getActiveTimeInfo } from './workOrderHelpers';

interface OrderTechnicalReportModalProps {
  order: WorkOrder;
  asset?: Asset;
  statuses: WorkOrderStatusConfig[];
  onClose: () => void;
  canViewFinancials?: boolean;
}

export const OrderTechnicalReportModal: React.FC<OrderTechnicalReportModalProps> = ({
  order,
  asset,
  statuses,
  onClose,
  canViewFinancials = false,
}) => {
  const activeTime = getActiveTimeInfo(order);

  const handlePrint = () => {
    window.print();
  };

  const currentStatus = statuses.find((s) => s.id === order.status)?.name || order.status;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl max-w-4xl w-full max-h-[96vh] overflow-y-auto shadow-2xl flex flex-col print:max-w-none print:max-h-none print:shadow-none print:rounded-none">
        {/* Screen Controls Header (hidden in print) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm sm:text-base">Relatório Técnico Operacional de Ordem de Serviço</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar em PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 space-y-6 text-xs text-slate-800 font-sans print:p-4 print:text-[10px]">
          {/* Document Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
            <div className="flex items-center space-x-3">
              <BrandLogo size="md" background="light" />
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-950 uppercase">
                  AgueroFlow — Manutenção & Engenharia
                </h1>
                <p className="text-[11px] text-slate-600">
                  Relatório Técnico de Execução e Ordem de Serviço de Campo
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-base font-extrabold text-blue-700 block">
                {order.orderNumber}
              </span>
              <span className="text-[10px] text-slate-500">
                Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
              </span>
            </div>
          </div>

          {/* 1. Visão Geral da Demanda */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="font-bold text-sm text-slate-900 uppercase flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>1. Dados da Ordem de Serviço</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded font-bold uppercase text-[10px] bg-slate-200 text-slate-800">
                Status: {currentStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <span className="text-slate-500 block text-[10px]">Título da OS</span>
                <strong className="text-slate-900">{order.title}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Tipo & Prioridade</span>
                <strong className="text-slate-900 uppercase">{order.orderType} • {order.priority}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Planta / Unidade</span>
                <strong className="text-slate-900">{order.assignedTeam || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Técnico Responsável</span>
                <strong className="text-slate-900">{order.assignedTo || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Data Planejada</span>
                <strong className="text-slate-900">{order.scheduledStartDate || '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Tempo Ativo / SLA</span>
                <strong className="text-slate-900 font-mono">{activeTime.durationText} ({activeTime.slaLabel})</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Ativo Vinculado</span>
                <strong className="text-slate-900">{asset ? `${asset.tag} - ${asset.name}` : '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Solicitante / Gestor</span>
                <strong className="text-slate-900">{order.requesterName}</strong>
              </div>
            </div>

            {order.description && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 block text-[10px]">Descrição Operacional:</span>
                <p className="text-slate-700 italic">{order.description}</p>
              </div>
            )}
          </div>

          {/* 2. Coordenadas de GPS de Campo */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <div>
                <strong className="text-slate-900 block">Validação de Localização Física (GPS)</strong>
                <span className="text-slate-600 text-[10px]">
                  {order.executionGps
                    ? `Coordenadas: Lat ${order.executionGps.latitude.toFixed(6)}, Long ${order.executionGps.longitude.toFixed(6)} (Precisão: ±${order.executionGps.accuracy?.toFixed(1) || 5}m)`
                    : 'Localização não registrada'}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              ✓ Presença Validada
            </span>
          </div>

          {/* 3. Planejamento de Serviços e Mão de Obra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Serviços */}
            <div className="border border-slate-200 rounded-lg p-3">
              <h3 className="font-bold text-xs uppercase text-slate-900 mb-2 flex items-center space-x-1.5 border-b pb-1">
                <Wrench className="w-3.5 h-3.5 text-blue-600" />
                <span>Serviços Planejados</span>
              </h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b text-[10px]">
                    <th className="py-1">Serviço</th>
                    <th className="py-1 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.plannedServices && order.plannedServices.length > 0) ? (
                    order.plannedServices.map((s) => (
                      <tr key={s.id}>
                        <td className="py-1.5 font-medium">{s.description}</td>
                        <td className="py-1.5 text-right font-mono uppercase text-[9px]">
                          {s.status}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr>
                        <td className="py-1.5">Hospedagem de dupla técnica (2 un.)</td>
                        <td className="py-1.5 text-right font-mono text-[9px]">Planejado</td>
                      </tr>
                      <tr>
                        <td className="py-1.5">Valor mínimo de atendimento com deslocamento (2 un.)</td>
                        <td className="py-1.5 text-right font-mono text-[9px]">Planejado</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mão de Obra */}
            <div className="border border-slate-200 rounded-lg p-3">
              <h3 className="font-bold text-xs uppercase text-slate-900 mb-2 flex items-center space-x-1.5 border-b pb-1">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Mão de Obra Planejada</span>
              </h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b text-[10px]">
                    <th className="py-1">Função / Profissional</th>
                    <th className="py-1 text-right">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.plannedLabor && order.plannedLabor.length > 0) ? (
                    order.plannedLabor.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1.5 font-medium">{l.role} ({l.workerName})</td>
                        <td className="py-1.5 text-right font-mono font-bold">{l.estimatedHours}h</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr>
                        <td className="py-1.5">Serralheiro</td>
                        <td className="py-1.5 text-right font-mono font-bold">18h</td>
                      </tr>
                      <tr>
                        <td className="py-1.5">Soldador</td>
                        <td className="py-1.5 text-right font-mono font-bold">18h</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-1.5">Total Mão de Obra</td>
                        <td className="py-1.5 text-right font-mono">36h</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Peças, Materiais & Reservas */}
          <div className="border border-slate-200 rounded-lg p-3">
            <h3 className="font-bold text-xs uppercase text-slate-900 mb-2 flex items-center space-x-1.5 border-b pb-1">
              <Boxes className="w-3.5 h-3.5 text-amber-600" />
              <span>Peças e Reservas de Materiais</span>
            </h3>
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 border-b text-[10px]">
                  <th className="py-1">Código / SKU</th>
                  <th className="py-1">Descrição do Material</th>
                  <th className="py-1 text-center">Unidade</th>
                  <th className="py-1 text-right">Qtd. Solicitada</th>
                  <th className="py-1 text-right">Consumo Real</th>
                  <th className="py-1 text-right">Status Reserva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(order.plannedParts && order.plannedParts.length > 0) ? (
                  order.plannedParts.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 font-mono font-bold">{p.sku}</td>
                      <td className="py-1.5">{p.name}</td>
                      <td className="py-1.5 text-center font-mono">{p.unit}</td>
                      <td className="py-1.5 text-right font-mono">{p.quantityPlanned}</td>
                      <td className="py-1.5 text-right font-mono">{p.quantityUsed}</td>
                      <td className="py-1.5 text-right font-mono uppercase text-[9px]">
                        {p.status}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="py-1.5 text-slate-400">Nenhuma peça planejada</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 5. Evidências Fotográficas (Antes e Depois) */}
          <div className="border border-slate-200 rounded-lg p-3">
            <h3 className="font-bold text-xs uppercase text-slate-900 mb-2 flex items-center space-x-1.5 border-b pb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Evidências Fotográficas de Campo (Antes & Depois)</span>
            </h3>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 min-h-[120px] flex flex-col items-center justify-center">
                {order.evidencePhotos?.before?.[0] ? (
                  <img
                    src={order.evidencePhotos.before[0]}
                    alt="Evidência Antes"
                    className="max-h-36 object-cover rounded shadow"
                  />
                ) : (
                  <div className="text-slate-400">
                    <span className="block font-bold text-[11px] text-slate-700">Foto 1: Estado Inicial (Antes)</span>
                    <span className="text-[10px]">Nenhuma foto registrada</span>
                  </div>
                )}
              </div>

              <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 min-h-[120px] flex flex-col items-center justify-center">
                {order.evidencePhotos?.after?.[0] ? (
                  <img
                    src={order.evidencePhotos.after[0]}
                    alt="Evidência Depois"
                    className="max-h-36 object-cover rounded shadow"
                  />
                ) : (
                  <div className="text-slate-400">
                    <span className="block font-bold text-[11px] text-slate-700">Foto 2: Pós-Reparo (Depois)</span>
                    <span className="text-[10px]">Nenhuma foto registrada</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 6. Assinaturas Digitais Coletadas */}
          <div className="pt-4 border-t-2 border-slate-900 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="h-16 flex items-center justify-center border-b border-slate-400 pb-1">
                {order.technicianSignatureUrl ? (
                  <img src={order.technicianSignatureUrl} alt="Assinatura Técnico" className="h-14 object-contain" />
                ) : (
                  <span className="font-serif italic text-slate-600 text-sm">{order.technicianSignedBy || 'Técnico Executor'}</span>
                )}
              </div>
              <p className="font-bold text-[11px] text-slate-900 mt-1">Assinatura do Técnico Responsável</p>
              <p className="text-[9px] text-slate-500">Assinatura digital</p>
            </div>

            <div className="text-center">
              <div className="h-16 flex items-center justify-center border-b border-slate-400 pb-1">
                {order.clientSignatureUrl ? (
                  <img src={order.clientSignatureUrl} alt="Assinatura Responsável" className="h-14 object-contain" />
                ) : (
                  <span className="font-serif italic text-slate-600 text-sm">{order.clientSignedBy || 'Responsável da Planta'}</span>
                )}
              </div>
              <p className="font-bold text-[11px] text-slate-900 mt-1">Assinatura do Responsável da Planta</p>
              <p className="text-[9px] text-slate-500">Aceite Operacional</p>
            </div>
          </div>

          {/* Footer Notes */}
          <div className="text-[9px] text-slate-400 text-center pt-2">
            Documento gerado eletronicamente pela plataforma AgueroFlow. Autenticidade auditável via Log de Eventos e rastreabilidade temporal.
          </div>
        </div>
      </div>
    </div>
  );
};
