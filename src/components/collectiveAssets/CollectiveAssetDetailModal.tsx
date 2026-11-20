import React, { useState } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetMovement,
  CollectiveAssetService,
  CollectiveAssetCategory,
} from '../../types/collectiveAssets';
import {
  X,
  Wrench,
  Clock,
  User,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  Paperclip,
  Eye,
  History,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  Building,
  Tag,
  Download,
} from 'lucide-react';

interface CollectiveAssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: CollectiveAsset | null;
  category?: CollectiveAssetCategory;
  movements: CollectiveAssetMovement[];
  services: CollectiveAssetService[];
  onOpenCheckout?: (asset: CollectiveAsset) => void;
  onOpenReturn?: (movement: CollectiveAssetMovement) => void;
  onOpenService?: (asset: CollectiveAsset) => void;
  canManage?: boolean;
}

export const CollectiveAssetDetailModal: React.FC<CollectiveAssetDetailModalProps> = ({
  isOpen,
  onClose,
  asset,
  category,
  movements,
  services,
  onOpenCheckout,
  onOpenReturn,
  onOpenService,
  canManage,
}) => {
  const [activeTab, setActiveTab] = useState<
    'cadastro' | 'responsavel' | 'movimentacoes' | 'servicos' | 'anexos' | 'timeline'
  >('cadastro');
  const [viewingAttachment, setViewingAttachment] = useState<{ url: string; name: string } | null>(null);

  if (!isOpen || !asset) return null;

  // Filter movements for this asset
  const assetMovements = movements
    .filter((m) => m.assetId === asset.id)
    .sort((a, b) => new Date(b.checkoutDate).getTime() - new Date(a.checkoutDate).getTime());

  // Filter services for this asset
  const assetServices = services
    .filter((s) => s.assetId === asset.id)
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));

  // Current active movement
  const currentActiveMovement = assetMovements.find((m) => !m.returnDate);

  // Timeline events combined
  const timelineEvents = [
    ...assetMovements.map((m) => ({
      id: `mov_out_${m.id}`,
      type: 'saida' as const,
      date: m.checkoutDate,
      title: `Retirada realizada por ${m.workerName} (${m.workerRegistration})`,
      subtitle: `Liberado por: ${m.releasedBy}`,
      details: m.checkoutNotes || 'Sem observações adicionais',
      badge: m.status === 'ATRASADO' ? 'Atrasado' : m.status === 'EM_USO' ? 'Em Uso' : 'Devolvido',
      badgeColor: m.status === 'ATRASADO' ? 'text-red-400 bg-red-950/60' : 'text-blue-400 bg-blue-950/60',
    })),
    ...assetMovements
      .filter((m) => m.returnDate)
      .map((m) => ({
        id: `mov_in_${m.id}`,
        type: 'devolucao' as const,
        date: m.returnDate!,
        title: `Devolução recebida por ${m.receivedBy || 'Responsável'}`,
        subtitle: `Entregue por: ${m.workerName} • Condição: ${m.returnCondition?.toUpperCase() || 'OK'}`,
        details: m.returnNotes || 'Sem avarias relatadas',
        badge: m.returnCondition !== 'ok' ? 'Avaria/Ressalva' : 'Devolução OK',
        badgeColor: m.returnCondition !== 'ok' ? 'text-amber-400 bg-amber-950/60' : 'text-emerald-400 bg-emerald-950/60',
      })),
    ...assetServices.map((s) => ({
      id: `srv_${s.id}`,
      type: 'servico' as const,
      date: `${s.serviceDate}T12:00:00`,
      title: `${
        s.type === 'calibracao'
          ? 'Calibração'
          : s.type === 'manutencao_preventiva'
          ? 'Manutenção Preventiva'
          : 'Manutenção Corretiva'
      } - ${s.result.toUpperCase()}`,
      subtitle: `Executante: ${s.performer}${s.certificateOrOsNumber ? ` • Certificado/OS: ${s.certificateOrOsNumber}` : ''}`,
      details: s.notes || 'Sem observações',
      badge: s.result === 'reprovado' ? 'Reprovado' : 'Aprovado',
      badgeColor: s.result === 'reprovado' ? 'text-red-400 bg-red-950/60' : 'text-emerald-400 bg-emerald-950/60',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Situation badge color & text
  const getSituationDisplay = () => {
    switch (asset.situation) {
      case 'DISPONIVEL':
        return {
          label: 'Disponível',
          color: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
          icon: CheckCircle2,
        };
      case 'EM_USO':
        return {
          label: 'Em Uso',
          color: 'bg-blue-950/80 text-blue-300 border-blue-700/80',
          icon: User,
        };
      case 'EM_MANUTENCAO':
        return {
          label: 'Em Manutenção',
          color: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
          icon: Wrench,
        };
      case 'BLOQUEADO':
        return {
          label: 'Bloqueado por Vencimento',
          color: 'bg-red-950/80 text-red-300 border-red-700/80',
          icon: ShieldAlert,
        };
      case 'BAIXADO':
        return {
          label: 'Baixado',
          color: 'bg-slate-800 text-slate-400 border-slate-700',
          icon: AlertCircle,
        };
      default:
        return {
          label: 'Indefinido',
          color: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: AlertCircle,
        };
    }
  };

  const sit = getSituationDisplay();
  const SitIcon = sit.icon;

  const getAlertDisplay = () => {
    switch (asset.alert) {
      case 'VENCIDO':
        return {
          label: 'Vencido',
          color: 'bg-red-950 text-red-300 border-red-800',
          desc: `${Math.abs(asset.daysRemaining || 0)} dia(s) em atraso`,
        };
      case 'A_VENCER':
        return {
          label: 'A Vencer',
          color: 'bg-amber-950 text-amber-300 border-amber-800',
          desc: `${asset.daysRemaining} dia(s) restante(s)`,
        };
      case 'SEM_DATA':
        return {
          label: 'Sem Data Registrada',
          color: 'bg-purple-950 text-purple-300 border-purple-800',
          desc: 'Controle aplicável sem histórico',
        };
      case 'EM_DIA':
        return {
          label: 'Em Dia',
          color: 'bg-emerald-950 text-emerald-300 border-emerald-800',
          desc: `${asset.daysRemaining} dias até vencer`,
        };
      default:
        return {
          label: 'Não Aplicável',
          color: 'bg-slate-800 text-slate-400 border-slate-700',
          desc: 'Sem controle periódico ativo',
        };
    }
  };

  const alertInfo = getAlertDisplay();

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div className="flex items-start space-x-3">
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <Wrench className="w-6 h-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
                  {asset.code}
                </span>
                <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-xs font-bold border ${sit.color}`}>
                  <SitIcon className="w-3.5 h-3.5" />
                  <span>{sit.label}</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${alertInfo.color}`}>
                  {alertInfo.label}
                </span>
                {asset.isDemo && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                    Dados de demonstração
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1 leading-snug">
                {asset.description}
              </h2>
              <p className="text-xs text-slate-400">
                {category?.name || asset.categoryName || 'Sem categoria'} • {asset.brandModel || 'Marca não informada'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            {canManage && asset.situation === 'DISPONIVEL' && onOpenCheckout && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCheckout(asset);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition-colors cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Registrar Saída</span>
              </button>
            )}

            {canManage && asset.situation === 'EM_USO' && currentActiveMovement && onOpenReturn && (
              <button
                onClick={() => {
                  onClose();
                  onOpenReturn(currentActiveMovement);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition-colors cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Registrar Devolução</span>
              </button>
            )}

            {canManage && onOpenService && (
              <button
                onClick={() => {
                  onClose();
                  onOpenService(asset);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>Serviço</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 border-b border-slate-800/80 pt-2 pb-1 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('cadastro')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'cadastro'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Cadastro & Parâmetros
          </button>
          <button
            onClick={() => setActiveTab('responsavel')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center space-x-1.5 ${
              activeTab === 'responsavel'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span>Responsável & Situação</span>
            {asset.currentCheckout && (
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('movimentacoes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'movimentacoes'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Movimentações ({assetMovements.length})
          </button>
          <button
            onClick={() => setActiveTab('servicos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'servicos'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Manutenção & Calibração ({assetServices.length})
          </button>
          <button
            onClick={() => setActiveTab('anexos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'anexos'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Anexos ({asset.attachments?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Timeline ({timelineEvents.length})
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 mt-3 space-y-4 text-xs">
          {/* TAB 1: CADASTRO */}
          {activeTab === 'cadastro' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Código do Patrimônio</span>
                  <strong className="text-sm font-mono text-white block mt-0.5">{asset.code}</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Patrimônio / Nº de Série</span>
                  <strong className="text-sm font-mono text-white block mt-0.5">{asset.serialNumber || 'N/A'}</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Local de Guarda</span>
                  <strong className="text-sm text-slate-200 block mt-0.5">{asset.storageLocation || 'Não informado'}</strong>
                </div>
              </div>

              {/* Parâmetros de Periodicidade */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Regras e Periodicidades de Vencimento</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Manutenção Preventiva</span>
                    <strong className="text-slate-200 font-mono text-xs block mt-0.5">
                      {asset.overrideMaintenanceIntervalMonths !== undefined && asset.overrideMaintenanceIntervalMonths !== null
                        ? asset.overrideMaintenanceIntervalMonths === 0
                          ? 'Desativado para este bem (0 meses)'
                          : `${asset.overrideMaintenanceIntervalMonths} meses (sobrescrito)`
                        : category?.preventiveMaintenanceIntervalMonths
                        ? `${category.preventiveMaintenanceIntervalMonths} meses (herdado da categoria)`
                        : 'Não aplicável'}
                    </strong>
                    <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                      <div>Última realizada: <span className="text-slate-200 font-mono">{asset.lastMaintenanceDate || 'Sem registro'}</span></div>
                      <div>Próxima manutenção: <span className="text-amber-300 font-mono">{asset.nextMaintenanceDate || 'Sem data'}</span></div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Calibração Periódica</span>
                    <strong className="text-slate-200 font-mono text-xs block mt-0.5">
                      {asset.overrideCalibrationIntervalMonths !== undefined && asset.overrideCalibrationIntervalMonths !== null
                        ? asset.overrideCalibrationIntervalMonths === 0
                          ? 'Desativado para este bem (0 meses)'
                          : `${asset.overrideCalibrationIntervalMonths} meses (sobrescrito)`
                        : category?.calibrationIntervalMonths
                        ? `${category.calibrationIntervalMonths} meses (herdado da categoria)`
                        : 'Não aplicável'}
                    </strong>
                    <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                      <div>Última aprovada: <span className="text-slate-200 font-mono">{asset.lastCalibrationDate || 'Sem registro'}</span></div>
                      <div>Próxima calibração: <span className="text-amber-300 font-mono">{asset.nextCalibrationDate || 'Sem data'}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {asset.notes && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block font-semibold mb-1">Observações Técnicas</span>
                  <p className="text-slate-300 leading-relaxed">{asset.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RESPONSÁVEL ATUAL & SITUAÇÃO */}
          {activeTab === 'responsavel' && (
            <div className="space-y-4">
              {asset.currentCheckout ? (
                <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 space-y-3">
                  <div className="flex items-center space-x-2 text-blue-400 font-bold">
                    <User className="w-5 h-5" />
                    <span>Empréstimo em Aberto</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Colaborador em Posse</span>
                      <strong className="text-sm text-white block mt-0.5">
                        {asset.currentCheckout.workerName}
                      </strong>
                      <span className="text-slate-400 font-mono text-[10px]">
                        Matrícula: {asset.currentCheckout.workerRegistration}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[11px] block">Retirado em</span>
                      <strong className="text-xs text-slate-200 font-mono block mt-0.5">
                        {new Date(asset.currentCheckout.checkoutDate).toLocaleString('pt-BR')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[11px] block">Status do Empréstimo</span>
                      <span
                        className={`inline-block px-2.5 py-1 rounded text-xs font-bold mt-1 ${
                          asset.currentCheckout.isLate
                            ? 'bg-red-950 text-red-300 border border-red-700'
                            : 'bg-blue-900 text-blue-200 border border-blue-700'
                        }`}
                      >
                        {asset.currentCheckout.isLate ? 'ATRASADO (Dia posterior)' : 'EM USO (No dia)'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">
                    O bem está atualmente no almoxarifado / local de guarda ({asset.storageLocation || 'Almoxarifado'}).
                  </p>
                  <p className="text-xs text-slate-500">
                    Nenhum colaborador possui retirada em aberto deste item no momento.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MOVIMENTAÇÕES (RETIRADAS E DEVOLUÇÕES) */}
          {activeTab === 'movimentacoes' && (
            <div className="space-y-3">
              {assetMovements.length === 0 ? (
                <p className="p-8 text-center text-slate-500">Nenhuma movimentação registrada para este bem.</p>
              ) : (
                <div className="divide-y divide-slate-800 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                  {assetMovements.map((m) => (
                    <div key={m.id} className="p-3.5 space-y-2 hover:bg-slate-850/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <div className="flex items-center space-x-2">
                          <User className="w-3.5 h-3.5 text-blue-400" />
                          <strong className="text-white">{m.workerName}</strong>
                          <span className="font-mono text-slate-400 text-[10px]">({m.workerRegistration})</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold self-start sm:self-auto ${
                            m.status === 'DEVOLVIDO'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : m.status === 'ATRASADO'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                        <div>
                          Saída: <span className="text-slate-200 font-mono">{new Date(m.checkoutDate).toLocaleString('pt-BR')}</span> (por {m.releasedBy})
                        </div>
                        <div>
                          Devolução: {m.returnDate ? (
                            <span className="text-slate-200 font-mono">
                              {new Date(m.returnDate).toLocaleString('pt-BR')} (Recebido: {m.receivedBy || 'N/A'})
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold">Em aberto</span>
                          )}
                        </div>
                      </div>
                      {m.returnCondition && (
                        <div className="text-[11px] flex items-center space-x-1.5 pt-1">
                          <span className="text-slate-400">Condição devolvida:</span>
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            m.returnCondition === 'ok' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
                          }`}>
                            {m.returnCondition.replace('_', ' ')}
                          </span>
                          {m.returnNotes && <span className="text-slate-400 italic">— "{m.returnNotes}"</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MANUTENÇÕES E CALIBRAÇÕES */}
          {activeTab === 'servicos' && (
            <div className="space-y-3">
              {assetServices.length === 0 ? (
                <p className="p-8 text-center text-slate-500">Nenhum serviço registrado para este bem.</p>
              ) : (
                <div className="divide-y divide-slate-800 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                  {assetServices.map((s) => (
                    <div key={s.id} className="p-3.5 space-y-1.5 hover:bg-slate-850/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white uppercase text-[11px]">
                            {s.type === 'calibracao'
                              ? 'Calibração'
                              : s.type === 'manutencao_preventiva'
                              ? 'Manutenção Preventiva'
                              : 'Manutenção Corretiva'}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">{s.serviceDate}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold self-start sm:self-auto uppercase ${
                            s.result === 'reprovado'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {s.result.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Executante: <span className="text-slate-200">{s.performer}</span>
                        {s.certificateOrOsNumber && (
                          <span className="ml-2 font-mono text-cyan-400">OS/Cert: {s.certificateOrOsNumber}</span>
                        )}
                      </div>
                      {s.notes && <p className="text-[11px] text-slate-300 italic pt-1">"{s.notes}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANEXOS */}
          {activeTab === 'anexos' && (
            <div className="space-y-3">
              {(!asset.attachments || asset.attachments.length === 0) ? (
                <p className="p-8 text-center text-slate-500">Nenhum anexo associado a este bem.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {asset.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs text-white truncate">{att.name}</span>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewingAttachment(att)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs"
                          title="Visualizar anexo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={att.url}
                          download={att.name}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs"
                          title="Baixar anexo"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: TIMELINE UNIFICADA */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {timelineEvents.length === 0 ? (
                <p className="p-8 text-center text-slate-500">Nenhum evento registrado ainda.</p>
              ) : (
                <div className="relative pl-6 space-y-4 border-l border-slate-800 ml-3 py-2">
                  {timelineEvents.map((ev) => (
                    <div key={ev.id} className="relative">
                      <span className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#121826]" />
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <strong className="text-white">{ev.title}</strong>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ev.badgeColor}`}>
                            {ev.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {new Date(ev.date).toLocaleString('pt-BR')} • {ev.subtitle}
                        </span>
                        {ev.details && <p className="text-[11px] text-slate-300 italic pt-1">{ev.details}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Attachment Viewer Sub-modal */}
        {viewingAttachment && (
          <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-3xl w-full p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-sm font-bold text-white truncate">{viewingAttachment.name}</span>
                <button
                  onClick={() => setViewingAttachment(null)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto flex items-center justify-center">
                {viewingAttachment.url.startsWith('data:image/') ? (
                  <img src={viewingAttachment.url} alt={viewingAttachment.name} className="max-h-[65vh] object-contain rounded" />
                ) : (
                  <iframe src={viewingAttachment.url} title={viewingAttachment.name} className="w-full h-[65vh] rounded" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
