import React, { useState, useMemo } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetService,
  CollectiveAssetServiceType,
  CollectiveAssetServiceResult,
  CollectiveAssetCategory,
  CollectiveAssetCalculations,
} from '../../types/collectiveAssets';
import { recordAssetService } from '../../services/collectiveAssetsService';
import {
  Wrench,
  Gauge,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCheck,
  Calendar,
  Building2,
  FileText,
  ShieldCheck,
} from 'lucide-react';

interface CollectiveServicesManagerProps {
  organizationId: string;
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  services: CollectiveAssetService[];
  calculatedAssetsMap: Map<string, CollectiveAssetCalculations>;
  canManage: boolean;
  canOperate: boolean;
  userEmail: string;
  onOpenAssetDetail?: (asset: CollectiveAsset) => void;
}

export const CollectiveServicesManager: React.FC<CollectiveServicesManagerProps> = ({
  organizationId,
  assets,
  categories,
  services,
  calculatedAssetsMap,
  canManage,
  canOperate,
  userEmail,
  onOpenAssetDetail,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'preventive' | 'corrective' | 'calibration'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'approved' | 'approved_with_adjustment' | 'disapproved'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');

  // Service Modal
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [formAssetId, setFormAssetId] = useState('');
  const [formServiceType, setFormServiceType] = useState<CollectiveAssetServiceType>('preventive_maintenance');
  const [formServiceDate, setFormServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [formResult, setFormResult] = useState<CollectiveAssetServiceResult>('approved');
  const [formPerformedBy, setFormPerformedBy] = useState('');
  const [formCertificateOrOrder, setFormCertificateOrOrder] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAttachmentUrl, setFormAttachmentUrl] = useState('');
  const [formRestoreAssetActive, setFormRestoreAssetActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Filtered services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const sType = s.type || s.serviceType;
      if (typeFilter === 'preventive' && sType !== 'preventive_maintenance' && sType !== 'manutencao_preventiva') return false;
      if (typeFilter === 'corrective' && sType !== 'corrective_maintenance' && sType !== 'manutencao_corretiva') return false;
      if (typeFilter === 'calibration' && sType !== 'calibration' && sType !== 'calibracao') return false;

      const sRes = s.result;
      if (resultFilter === 'approved' && sRes !== 'approved' && sRes !== 'aprovado') return false;
      if (resultFilter === 'approved_with_adjustment' && sRes !== 'approved_with_adjustment' && sRes !== 'aprovado_com_ajuste') return false;
      if (resultFilter === 'disapproved' && sRes !== 'disapproved' && sRes !== 'reprovado') return false;
      if (selectedAssetId && s.assetId !== selectedAssetId) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const code = (s.assetCode || '').toLowerCase();
        const linkedAsset = assets.find((a) => a.id === s.assetId);
        const desc = (s.assetDescription || linkedAsset?.description || '').toLowerCase();
        const perf = (s.performer || s.performedBy || '').toLowerCase();
        const cert = (s.certificateOrOsNumber || s.certificateOrOrderNumber || '').toLowerCase();
        const notes = (s.notes || '').toLowerCase();
        return code.includes(term) || desc.includes(term) || perf.includes(term) || cert.includes(term) || notes.includes(term);
      }
      return true;
    });
  }, [services, typeFilter, resultFilter, selectedAssetId, searchTerm, assets]);

  const handleOpenAddService = (assetId?: string) => {
    setFormAssetId(assetId || (assets.length > 0 ? assets[0].id : ''));
    setFormServiceType('preventive_maintenance');
    setFormServiceDate(new Date().toISOString().slice(0, 10));
    setFormResult('approved');
    setFormPerformedBy('');
    setFormCertificateOrOrder('');
    setFormNotes('');
    setFormAttachmentUrl('');
    setFormRestoreAssetActive(true);
    setErrorMessage('');
    setIsServiceModalOpen(true);
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formAssetId) {
      setErrorMessage('Selecione o bem que recebeu o serviço.');
      return;
    }
    if (!formPerformedBy.trim()) {
      setErrorMessage('Informe a empresa ou técnico executante.');
      return;
    }

    // Validation: No future date
    const today = new Date().toISOString().slice(0, 10);
    if (formServiceDate > today) {
      setErrorMessage('A data de realização não pode ser futura.');
      return;
    }

    const selectedAsset = assets.find((a) => a.id === formAssetId);
    if (!selectedAsset) {
      setErrorMessage('Bem não encontrado.');
      return;
    }

    try {
      setIsSubmitting(true);
      await recordAssetService({
        organizationId,
        asset: selectedAsset,
        serviceType: formServiceType,
        serviceDate: formServiceDate,
        result: formResult,
        performedBy: formPerformedBy.trim(),
        certificateOrOrderNumber: formCertificateOrOrder.trim() || undefined,
        notes: formNotes.trim() || undefined,
        attachmentUrl: formAttachmentUrl.trim() || undefined,
        restoreAssetToActive:
          formRestoreAssetActive &&
          (selectedAsset.condition === 'em_manutencao' || (selectedAsset.condition as string) === 'in_maintenance') &&
          formResult !== 'disapproved' &&
          (formResult as string) !== 'reprovado',
      });
      setIsServiceModalOpen(false);
    } catch (err: unknown) {
      console.error('Erro ao registrar serviço:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao gravar serviço.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-400" />
            Manutenção e Calibração
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Registro cronológico e imutável de manutenções preventivas, corretivas e calibrações com controle de ciclo.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => handleOpenAddService()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-indigo-500 hover:bg-indigo-400 text-white transition shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            + Registrar Serviço / Laudo
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Service Type Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-[#121826] p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              typeFilter === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({services.length})
          </button>
          <button
            onClick={() => setTypeFilter('preventive')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              typeFilter === 'preventive'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Preventivas ({services.filter((s) => (s.type || s.serviceType) === 'preventive_maintenance' || (s.type || s.serviceType) === 'manutencao_preventiva').length})
          </button>
          <button
            onClick={() => setTypeFilter('calibration')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              typeFilter === 'calibration'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            Calibrações ({services.filter((s) => (s.type || s.serviceType) === 'calibration' || (s.type || s.serviceType) === 'calibracao').length})
          </button>
          <button
            onClick={() => setTypeFilter('corrective')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              typeFilter === 'corrective'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Corretivas ({services.filter((s) => (s.type || s.serviceType) === 'corrective_maintenance' || (s.type || s.serviceType) === 'manutencao_corretiva').length})
          </button>
        </div>

        {/* Search & Result Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por bem, OS, técnico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#121826] border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as any)}
            className="bg-[#121826] border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Todos os Resultados</option>
            <option value="approved">Aprovados</option>
            <option value="approved_with_adjustment">Aprovados c/ Ajuste</option>
            <option value="disapproved">Reprovados</option>
          </select>
        </div>
      </div>

      {/* Services Table */}
      <div className="bg-[#121826] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b101b] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Data Realização</th>
                <th className="py-3 px-4">Bem / Código</th>
                <th className="py-3 px-4">Tipo de Serviço</th>
                <th className="py-3 px-4">Executante / OS</th>
                <th className="py-3 px-4">Resultado</th>
                <th className="py-3 px-4">Efeito no Ciclo</th>
                <th className="py-3 px-4 text-right">Anexos / Obs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum registro de manutenção ou calibração encontrado.
                  </td>
                </tr>
              ) : (
                filteredServices.map((s) => {
                  const linkedAsset = assets.find((a) => a.id === s.assetId);
                  const sType = s.type || s.serviceType;
                  const isApproved = s.result !== 'disapproved' && (s.result as string) !== 'reprovado';
                  const isPreventive = sType === 'preventive_maintenance' || sType === 'manutencao_preventiva';
                  const isCalibration = sType === 'calibration' || sType === 'calibracao';
                  const isCorrective = sType === 'corrective_maintenance' || sType === 'manutencao_corretiva';
                  const resetsCycle = (isPreventive || isCalibration) && isApproved;
                  const sPerformer = s.performer || s.performedBy || 'Não especificado';
                  const sCert = s.certificateOrOsNumber || s.certificateOrOrderNumber;
                  const sUrl = s.attachmentUrl || s.attachments?.[0]?.url;

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition">
                      {/* Data */}
                      <td className="py-3 px-4 font-mono text-slate-300 font-medium">
                        {new Date(s.serviceDate).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Bem */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => linkedAsset && onOpenAssetDetail?.(linkedAsset)}
                          className="text-left group"
                        >
                          <div className="font-mono text-[11px] text-amber-400 font-bold group-hover:underline">
                            {s.assetCode}
                          </div>
                          <div className="text-slate-200 font-medium text-xs truncate max-w-[200px]">
                            {s.assetDescription || linkedAsset?.description || s.assetCode}
                          </div>
                        </button>
                      </td>

                      {/* Tipo */}
                      <td className="py-3 px-4">
                        {isPreventive && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            <ShieldCheck className="w-3 h-3" /> Preventiva
                          </span>
                        )}
                        {isCalibration && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            <Gauge className="w-3 h-3" /> Calibração
                          </span>
                        )}
                        {isCorrective && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Wrench className="w-3 h-3" /> Corretiva
                          </span>
                        )}
                      </td>

                      {/* Executante / OS */}
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-medium flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {sPerformer}
                        </div>
                        {sCert && (
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            Doc: {sCert}
                          </div>
                        )}
                      </td>

                      {/* Resultado */}
                      <td className="py-3 px-4">
                        {(s.result === 'approved' || (s.result as string) === 'aprovado') && (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                          </span>
                        )}
                        {(s.result === 'approved_with_adjustment' || (s.result as string) === 'aprovado_com_ajuste') && (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-medium text-xs">
                            <AlertTriangle className="w-3.5 h-3.5" /> Aprovado c/ Ajuste
                          </span>
                        )}
                        {(s.result === 'disapproved' || (s.result as string) === 'reprovado') && (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-medium text-xs">
                            <XCircle className="w-3.5 h-3.5" /> Reprovado
                          </span>
                        )}
                      </td>

                      {/* Efeito no Ciclo */}
                      <td className="py-3 px-4">
                        {resetsCycle ? (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            Reiniciou Ciclo
                          </span>
                        ) : isCorrective ? (
                          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md">
                            Histórico Apenas
                          </span>
                        ) : (
                          <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                            Não Reinicia (Reprovado)
                          </span>
                        )}
                      </td>

                      {/* Anexos / Obs */}
                      <td className="py-3 px-4 text-right">
                        {sUrl && (
                          <a
                            href={sUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold mb-1"
                          >
                            <FileCheck className="w-3.5 h-3.5" /> Ver Laudo / OS
                          </a>
                        )}
                        {s.notes && (
                          <div className="text-[10px] text-slate-400 italic max-w-[180px] truncate ml-auto">
                            {s.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL: REGISTRAR SERVIÇO / LAUDO                          */}
      {/* ========================================================== */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#121826]/95 backdrop-blur z-10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-400" />
                Registrar Manutenção ou Calibração
              </h3>
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitService} className="p-6 space-y-4 flex-1">
              {errorMessage && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Bem */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Bem Coletivo <span className="text-indigo-400">*</span>
                </label>
                <select
                  value={formAssetId}
                  onChange={(e) => setFormAssetId(e.target.value)}
                  required
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Selecione o bem...</option>
                  {assets.map((asset) => {
                    const isInMaint =
                      asset.condition === 'em_manutencao' || (asset.condition as string) === 'in_maintenance';
                    return (
                      <option key={asset.id} value={asset.id}>
                        [{asset.code}] {asset.description} — {asset.categoryName}{' '}
                        {isInMaint ? '(Atualmente Em Manutenção)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Tipo e Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Serviço <span className="text-indigo-400">*</span>
                  </label>
                  <select
                    value={formServiceType}
                    onChange={(e) => setFormServiceType(e.target.value as CollectiveAssetServiceType)}
                    required
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="preventive_maintenance">Manutenção Preventiva</option>
                    <option value="calibration">Calibração</option>
                    <option value="corrective_maintenance">Manutenção Corretiva</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data de Realização <span className="text-indigo-400">*</span>
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={formServiceDate}
                    onChange={(e) => setFormServiceDate(e.target.value)}
                    required
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Datas futuras não são permitidas.</p>
                </div>
              </div>

              {/* Executante e Certificado/OS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Empresa / Técnico Executante <span className="text-indigo-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Laboratório Metrologia Silva"
                    value={formPerformedBy}
                    onChange={(e) => setFormPerformedBy(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nº Certificado / Ordem de Serviço
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CERT-2025-9844"
                    value={formCertificateOrOrder}
                    onChange={(e) => setFormCertificateOrOrder(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Resultado do Laudo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Resultado do Serviço / Laudo <span className="text-indigo-400">*</span>
                </label>
                <select
                  value={formResult}
                  onChange={(e) => setFormResult(e.target.value as CollectiveAssetServiceResult)}
                  required
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="approved">Aprovado (Reinicia o ciclo de validade)</option>
                  <option value="approved_with_adjustment">
                    Aprovado com Ajuste (Reinicia o ciclo de validade)
                  </option>
                  <option value="disapproved">Reprovado (NÃO reinicia o ciclo)</option>
                </select>
              </div>

              {/* Desbloqueio se em manutenção */}
              {(() => {
                const targetAsset = assets.find((a) => a.id === formAssetId);
                const isInMaint =
                  targetAsset?.condition === 'em_manutencao' ||
                  (targetAsset?.condition as string) === 'in_maintenance';
                const isNotDisapproved =
                  formResult !== 'disapproved' && (formResult as string) !== 'reprovado';
                return isInMaint && isNotDisapproved;
              })() && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formRestoreAssetActive}
                        onChange={(e) => setFormRestoreAssetActive(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-emerald-300 font-semibold">
                        Restaurar condição do bem para &ldquo;Ativo&rdquo; (liberar para retiradas)
                      </span>
                    </label>
                  </div>
                )}

              {/* Link de Anexo / Laudo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Link do Certificado / PDF / Foto
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formAttachmentUrl}
                  onChange={(e) => setFormAttachmentUrl(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações / Parecer Técnico
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Detalhes dos ensaios realizados, peças trocadas ou desvios encontrados..."
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {isSubmitting ? 'Gravando serviço...' : 'Salvar Registro de Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
