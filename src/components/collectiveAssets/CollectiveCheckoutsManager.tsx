import React, { useState, useMemo } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetWorker,
  CollectiveAssetMovement,
  CollectiveAssetReturnCondition,
  CollectiveAssetCategory,
  CollectiveAssetCalculations,
} from '../../types/collectiveAssets';
import { executeAssetCheckout, executeAssetReturn } from '../../services/collectiveAssetsService';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  User,
  Wrench,
  FileText,
  ShieldAlert,
} from 'lucide-react';

interface CollectiveCheckoutsManagerProps {
  organizationId: string;
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  workers: CollectiveAssetWorker[];
  movements: CollectiveAssetMovement[];
  calculatedAssetsMap: Map<string, CollectiveAssetCalculations>;
  canOperate: boolean;
  canManage: boolean;
  userEmail: string;
  onRefresh?: () => void;
  onOpenAssetDetail?: (asset: CollectiveAsset) => void;
}

export const CollectiveCheckoutsManager: React.FC<CollectiveCheckoutsManagerProps> = ({
  organizationId,
  assets,
  categories,
  workers,
  movements,
  calculatedAssetsMap,
  canOperate,
  canManage,
  userEmail,
  onOpenAssetDetail,
}) => {
  const [tabFilter, setTabFilter] = useState<'all' | 'open' | 'overdue' | 'returned' | 'damaged'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');

  // Modals
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedMovementForReturn, setSelectedMovementForReturn] = useState<CollectiveAssetMovement | null>(null);

  // Form states - Checkout
  const [checkoutAssetId, setCheckoutAssetId] = useState('');
  const [checkoutWorkerId, setCheckoutWorkerId] = useState('');
  const [checkoutDateTime, setCheckoutDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [checkoutExpectedReturn, setCheckoutExpectedReturn] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Form states - Return
  const [returnDateTime, setReturnDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [returnCondition, setReturnCondition] = useState<CollectiveAssetReturnCondition>('ok');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnEvidenceUrl, setReturnEvidenceUrl] = useState('');
  const [forwardToMaintenance, setForwardToMaintenance] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Assets available for checkout (must be active, not checked out, not in maintenance, not baixado, and not blocked by policy)
  const availableAssetsForCheckout = useMemo(() => {
    return assets.filter((asset) => {
      if (asset.condition !== 'ativo' && (asset.condition as string) !== 'active') return false;
      if (asset.currentCheckout) return false;
      if (asset.situation === 'BLOQUEADO' || asset.situation === 'EM_MANUTENCAO' || asset.situation === 'BAIXADO') return false;
      return true;
    });
  }, [assets]);

  // Active workers only
  const activeWorkers = useMemo(() => {
    return workers.filter((w) => w.active !== false && w.isActive !== false);
  }, [workers]);

  // Open movements (currently in use or overdue)
  const openMovements = useMemo(() => {
    return movements.filter((m) => {
      const s = String(m.status).toUpperCase();
      return s === 'EM_USO' || s === 'ATRASADO';
    });
  }, [movements]);

  // Filtered movements list
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const s = String(m.status).toUpperCase();
      // Tab filter
      if (tabFilter === 'open' && s !== 'EM_USO' && s !== 'ATRASADO') return false;
      if (tabFilter === 'overdue' && s !== 'ATRASADO') return false;
      if (tabFilter === 'returned' && s !== 'DEVOLVIDO') return false;
      if (tabFilter === 'damaged' && (!m.returnCondition || m.returnCondition === 'ok')) return false;

      // Worker filter
      if (selectedWorkerId && m.workerId !== selectedWorkerId) return false;

      // Asset filter
      if (selectedAssetId && m.assetId !== selectedAssetId) return false;

      // Text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const assetCode = m.assetCode.toLowerCase();
        const assetName = m.assetDescription.toLowerCase();
        const worker = m.workerName.toLowerCase();
        const workerReg = (m.workerRegistration || '').toLowerCase();
        return (
          assetCode.includes(term) ||
          assetName.includes(term) ||
          worker.includes(term) ||
          workerReg.includes(term) ||
          (m.checkoutNotes && m.checkoutNotes.toLowerCase().includes(term)) ||
          (m.returnNotes && m.returnNotes.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [movements, tabFilter, selectedWorkerId, selectedAssetId, searchTerm]);

  // Handlers
  const handleOpenCheckout = () => {
    setCheckoutAssetId('');
    setCheckoutWorkerId('');
    setCheckoutDateTime(new Date().toISOString().slice(0, 16));
    setCheckoutExpectedReturn('');
    setCheckoutNotes('');
    setCheckoutError('');
    setIsCheckoutModalOpen(true);
  };

  const handleOpenReturn = (mov?: CollectiveAssetMovement) => {
    if (mov) {
      setSelectedMovementForReturn(mov);
    } else if (openMovements.length > 0) {
      setSelectedMovementForReturn(openMovements[0]);
    } else {
      setSelectedMovementForReturn(null);
    }
    setReturnDateTime(new Date().toISOString().slice(0, 16));
    setReturnCondition('ok');
    setReturnNotes('');
    setReturnEvidenceUrl('');
    setForwardToMaintenance(false);
    setReturnError('');
    setIsReturnModalOpen(true);
  };

  const handleSubmitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');

    if (!checkoutAssetId) {
      setCheckoutError('Selecione um bem coletivo disponível para retirada.');
      return;
    }
    if (!checkoutWorkerId) {
      setCheckoutError('Selecione o colaborador responsável pela retirada.');
      return;
    }

    const selectedAsset = assets.find((a) => a.id === checkoutAssetId);
    const selectedWorker = workers.find((w) => w.id === checkoutWorkerId);

    if (!selectedAsset) {
      setCheckoutError('Bem selecionado não foi encontrado.');
      return;
    }
    if (!selectedWorker) {
      setCheckoutError('Colaborador selecionado não foi encontrado.');
      return;
    }

    try {
      setCheckoutSubmitting(true);
      await executeAssetCheckout({
        organizationId,
        asset: selectedAsset,
        worker: selectedWorker,
        checkoutDate: checkoutDateTime,
        expectedReturnDate: checkoutExpectedReturn || undefined,
        checkoutNotes: checkoutNotes || undefined,
        releasedBy: userEmail || 'Sistema',
      });
      setIsCheckoutModalOpen(false);
    } catch (err: unknown) {
      console.error('Erro ao registrar retirada:', err);
      setCheckoutError(err instanceof Error ? err.message : 'Falha ao processar retirada.');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError('');

    if (!selectedMovementForReturn) {
      setReturnError('Selecione a retirada em aberto a ser devolvida.');
      return;
    }

    // Validation: Return time cannot precede checkout time
    const checkoutTimestamp = new Date(selectedMovementForReturn.checkoutDate).getTime();
    const returnTimestamp = new Date(returnDateTime).getTime();

    if (returnTimestamp < checkoutTimestamp) {
      setReturnError('A data/hora de devolução não pode ser anterior à data/hora da retirada.');
      return;
    }

    const linkedAsset = assets.find((a) => a.id === selectedMovementForReturn.assetId);

    try {
      setReturnSubmitting(true);
      await executeAssetReturn({
        movementId: selectedMovementForReturn.id,
        returnDate: returnDateTime,
        returnCondition,
        receivedBy: userEmail || 'Almoxarife',
        returnNotes: returnNotes || undefined,
        returnEvidenceUrl: returnEvidenceUrl || undefined,
        forwardToMaintenance,
        asset: linkedAsset,
      });
      setIsReturnModalOpen(false);
      setSelectedMovementForReturn(null);
    } catch (err: unknown) {
      console.error('Erro ao registrar devolução:', err);
      setReturnError(err instanceof Error ? err.message : 'Falha ao processar devolução.');
    } finally {
      setReturnSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-amber-500" />
            Retiradas e Devoluções
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle atômico de empréstimos e devoluções individualizadas com checagem de integridade e auditoria.
          </p>
        </div>

        {canOperate && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => handleOpenReturn()}
              disabled={openMovements.length === 0}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition border ${
                openMovements.length > 0
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800/40 text-slate-500 border-slate-800 cursor-not-allowed'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              Devolução ({openMovements.length})
            </button>

            <button
              onClick={handleOpenCheckout}
              disabled={availableAssetsForCheckout.length === 0}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition ${
                availableAssetsForCheckout.length > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              + Nova Retirada
            </button>
          </div>
        )}
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-[#121826] p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setTabFilter('open')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              tabFilter === 'open'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Em Aberto ({openMovements.length})
          </button>
          <button
            onClick={() => setTabFilter('overdue')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              tabFilter === 'overdue'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Atrasados ({movements.filter((m) => String(m.status).toUpperCase() === 'ATRASADO').length})
          </button>
          <button
            onClick={() => setTabFilter('returned')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              tabFilter === 'returned'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Devolvidos ({movements.filter((m) => String(m.status).toUpperCase() === 'DEVOLVIDO').length})
          </button>
          <button
            onClick={() => setTabFilter('damaged')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              tabFilter === 'damaged'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Devoluções com Avaria ({movements.filter((m) => m.returnCondition && m.returnCondition !== 'ok').length})
          </button>
          <button
            onClick={() => setTabFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              tabFilter === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({movements.length})
          </button>
        </div>

        {/* Search & Selector filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar bem, código ou colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#121826] border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="bg-[#121826] border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos os Colaboradores</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.registration})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-[#121826] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b101b] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Bem / Código</th>
                <th className="py-3 px-4">Colaborador</th>
                <th className="py-3 px-4">Saída / Responsável</th>
                <th className="py-3 px-4">Devolução / Recebido por</th>
                <th className="py-3 px-4">Status / Condição</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhuma movimentação encontrada para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const status = String(m.status).toUpperCase();
                  const isOverdue = status === 'ATRASADO';
                  const isOpen = status === 'EM_USO' || isOverdue;
                  const hasDamage = m.returnCondition && m.returnCondition !== 'ok';
                  const linkedAsset = assets.find((a) => a.id === m.assetId);

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition">
                      {/* Bem / Código */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => linkedAsset && onOpenAssetDetail?.(linkedAsset)}
                          className="text-left group"
                        >
                          <div className="font-mono text-[11px] text-amber-400 font-bold group-hover:underline flex items-center gap-1.5">
                            {m.assetCode}
                          </div>
                          <div className="text-slate-200 font-medium text-xs truncate max-w-[200px]">
                            {m.assetDescription}
                          </div>
                        </button>
                      </td>

                      {/* Colaborador */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {m.workerName}
                        </div>
                        <div className="text-slate-500 text-[11px] font-mono">Matrícula: {m.workerRegistration}</div>
                      </td>

                      {/* Saída */}
                      <td className="py-3 px-4">
                        <div className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {new Date(m.checkoutDate).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-slate-500 text-[11px]">Por: {m.releasedBy}</div>
                        {m.expectedReturnDate && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Prev: {new Date(m.expectedReturnDate).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </td>

                      {/* Devolução */}
                      <td className="py-3 px-4">
                        {m.returnDate ? (
                          <>
                            <div className="text-emerald-400 font-medium flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              {new Date(m.returnDate).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className="text-slate-500 text-[11px]">Recebido: {m.receivedBy || 'Almoxarife'}</div>
                          </>
                        ) : (
                          <span className="text-amber-400/80 text-[11px] font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Em posse do colaborador
                          </span>
                        )}
                      </td>

                      {/* Status / Condição */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              <AlertTriangle className="w-3 h-3" /> Atrasado
                            </span>
                          )}
                          {status === 'EM_USO' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              <Clock className="w-3 h-3" /> Em Uso Hoje
                            </span>
                          )}
                          {status === 'DEVOLVIDO' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Devolvido
                            </span>
                          )}

                          {hasDamage && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Wrench className="w-3 h-3" />
                              {(m.returnCondition === 'danificado' || m.returnCondition === 'damaged') && 'Danificado'}
                              {(m.returnCondition === 'faltando_acessorio' || m.returnCondition === 'missing_accessory') && 'Falta Acessório'}
                              {(m.returnCondition === 'precisa_manutencao' || m.returnCondition === 'needs_maintenance') && 'Precisa Manutenção'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        {isOpen && canOperate && (
                          <button
                            onClick={() => handleOpenReturn(m)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition inline-flex items-center gap-1.5"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            Devolver
                          </button>
                        )}
                        {m.returnNotes && (
                          <div className="text-[10px] text-slate-400 italic mt-1 max-w-[150px] truncate ml-auto">
                            &quot;{m.returnNotes}&quot;
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
      {/* MODAL: REGISTRAR RETIRADA                                 */}
      {/* ========================================================== */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#121826]/95 backdrop-blur z-10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-500" />
                Registrar Retirada de Bem
              </h3>
              <button
                onClick={() => setIsCheckoutModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCheckout} className="p-6 space-y-4 flex-1">
              {checkoutError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Bem Coletivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Bem Coletivo Disponível <span className="text-amber-500">*</span>
                </label>
                <select
                  value={checkoutAssetId}
                  onChange={(e) => setCheckoutAssetId(e.target.value)}
                  required
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione o bem a ser retirado...</option>
                  {availableAssetsForCheckout.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      [{asset.code}] {asset.description} - {asset.categoryName} ({asset.storageLocation || 'Local Padrão'})
                    </option>
                  ))}
                </select>
                {availableAssetsForCheckout.length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    Nenhum bem disponível para retirada no momento (todos em uso, em manutenção ou bloqueados por vencimento).
                  </p>
                )}
              </div>

              {/* Colaborador */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Colaborador Responsável <span className="text-amber-500">*</span>
                </label>
                <select
                  value={checkoutWorkerId}
                  onChange={(e) => setCheckoutWorkerId(e.target.value)}
                  required
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione o colaborador...</option>
                  {activeWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} - Matrícula {w.registration} ({w.role || 'Geral'} - {w.sector || 'Obras'})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Apenas colaboradores com status ATIVO podem retirar bens.
                </p>
              </div>

              {/* Data e Hora de Saída */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data e Hora da Saída <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={checkoutDateTime}
                    onChange={(e) => setCheckoutDateTime(e.target.value)}
                    required
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Previsão de Devolução (opcional)
                  </label>
                  <input
                    type="date"
                    value={checkoutExpectedReturn}
                    onChange={(e) => setCheckoutExpectedReturn(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações da Retirada
                </label>
                <textarea
                  rows={2}
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  placeholder="Ex: Utilização no Bloco B para passagem de tubulação..."
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCheckoutModalOpen(false)}
                  disabled={checkoutSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={checkoutSubmitting || availableAssetsForCheckout.length === 0}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {checkoutSubmitting ? (
                    <>Processando retirada atômica...</>
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      Confirmar Retirada
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: REGISTRAR DEVOLUÇÃO                                */}
      {/* ========================================================== */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#121826]/95 backdrop-blur z-10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
                Registrar Devolução de Bem
              </h3>
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="p-6 space-y-4 flex-1">
              {returnError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{returnError}</span>
                </div>
              )}

              {/* Seletor de Movimentação em Aberto */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Item a ser devolvido <span className="text-emerald-500">*</span>
                </label>
                <select
                  value={selectedMovementForReturn?.id || ''}
                  onChange={(e) => {
                    const mov = openMovements.find((m) => m.id === e.target.value);
                    setSelectedMovementForReturn(mov || null);
                  }}
                  required
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o bem em posse...</option>
                  {openMovements.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.assetCode}] {m.assetDescription} — com {m.workerName} (Retirado:{' '}
                      {new Date(m.checkoutDate).toLocaleDateString('pt-BR')})
                    </option>
                  ))}
                </select>
              </div>

              {selectedMovementForReturn && (
                <div className="bg-[#0b101b] p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                  <div className="text-slate-400">
                    <span className="font-semibold text-slate-300">Responsável:</span> {selectedMovementForReturn.workerName} (Matrícula: {selectedMovementForReturn.workerRegistration})
                  </div>
                  <div className="text-slate-400">
                    <span className="font-semibold text-slate-300">Retirado em:</span> {new Date(selectedMovementForReturn.checkoutDate).toLocaleString('pt-BR')} por {selectedMovementForReturn.releasedBy}
                  </div>
                  {selectedMovementForReturn.checkoutNotes && (
                    <div className="text-slate-400">
                      <span className="font-semibold text-slate-300">Obs. da Saída:</span> {selectedMovementForReturn.checkoutNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Data e Hora de Devolução */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data e Hora da Devolução <span className="text-emerald-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={returnDateTime}
                    onChange={(e) => setReturnDateTime(e.target.value)}
                    required
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Condição Física na Entrega <span className="text-emerald-500">*</span>
                  </label>
                  <select
                    value={returnCondition}
                    onChange={(e) => setReturnCondition(e.target.value as CollectiveAssetReturnCondition)}
                    required
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ok">OK (Íntegro e funcional)</option>
                    <option value="damaged">Danificado (Avariado / Quebrado)</option>
                    <option value="missing_accessory">Faltando Acessório</option>
                    <option value="needs_maintenance">Precisa de Manutenção Corretiva</option>
                  </select>
                </div>
              </div>

              {/* Se a condição não for OK: Alerta e Confirmação de Encaminhamento */}
              {returnCondition !== 'ok' && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                  <div className="flex items-start gap-2 text-xs text-amber-300 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      A devolução foi marcada com condição diferente de OK (
                        {returnCondition === 'danificado' || (returnCondition as string) === 'damaged'
                          ? 'Danificado'
                          : returnCondition === 'faltando_acessorio' || (returnCondition as string) === 'missing_accessory'
                          ? 'Faltando Acessório'
                          : 'Precisa de Manutenção'}
                      ).
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={forwardToMaintenance}
                      onChange={(e) => setForwardToMaintenance(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs text-slate-200 font-semibold">
                      Alterar condição do bem para &ldquo;Em Manutenção&rdquo; imediatamente
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Por segurança, a condição do bem não é alterada automaticamente sem a confirmação explícita do operador acima.
                  </p>
                </div>
              )}

              {/* Observações da Devolução */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações da Devolução
                </label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Relato de avarias, estado de limpeza ou peças ausentes..."
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Evidência / URL do anexo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Link de Foto / Evidência (opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={returnEvidenceUrl}
                  onChange={(e) => setReturnEvidenceUrl(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  disabled={returnSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={returnSubmitting || !selectedMovementForReturn}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {returnSubmitting ? (
                    <>Gravando devolução...</>
                  ) : (
                    <>
                      <ArrowDownLeft className="w-4 h-4" />
                      Confirmar Devolução
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
