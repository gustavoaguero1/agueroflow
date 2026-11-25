import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { maxOrderSeq, nextOrderNumber } from '../../services/workOrderNumbering';
import { WorkOrder, Asset, Occurrence, Unit } from '../../types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  TrendingDown,
  TrendingUp,
  Activity,
  ShieldAlert,
  Plus,
  ArrowRight,
  Filter,
  Search,
  Sparkles,
  Zap,
  Info,
  Calendar,
  Layers,
  FileText,
  RotateCw,
} from 'lucide-react';

interface PredictiveAnalysisViewProps {
  orders: WorkOrder[];
  assets: Asset[];
  occurrences: Occurrence[];
  units: Unit[];
  onRefresh?: () => void;
}

export interface AssetPrediction {
  asset: Asset;
  unitName: string;
  totalOrders: number;
  correctiveCount: number;
  preventiveCount: number;
  reworkCount: number;
  daysSinceLastMaintenance: number;
  lastOrderDate: string | null;
  mtbfDays: number; // Mean Time Between Failures
  mttrHours: number; // Mean Time To Repair
  failureProbabilityNext30Days: number; // 0.0 to 1.0
  failureProbabilityNext60Days: number;
  healthScore: number; // 0 to 100
  riskLevel: 'critico' | 'moderado' | 'estavel';
  estimatedDaysToFailure: number;
  recommendedAction: string;
  commonFailureModes: string[];
}

export const PredictiveAnalysisView: React.FC<PredictiveAnalysisViewProps> = ({
  orders,
  assets,
  occurrences,
  units,
  onRefresh,
}) => {
  const { organization, user, logAudit } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'todos' | 'critico' | 'moderado' | 'estavel'>('todos');
  const [selectedAssetPrediction, setSelectedAssetPrediction] = useState<AssetPrediction | null>(null);
  const [generatingOrder, setGeneratingOrder] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const displayAssets = assets;

  const predictions = useMemo<AssetPrediction[]>(() => {
    const today = new Date();

    return displayAssets.map((asset) => {
      // Find all past orders linked to this asset
      const assetOrders = orders.filter(
        (o) =>
          o.assetId === asset.id ||
          (o.description && o.description.toLowerCase().includes(asset.tag.toLowerCase())) ||
          (o.title && o.title.toLowerCase().includes(asset.tag.toLowerCase()))
      );

      const correctiveOrders = assetOrders.filter(
        (o) =>
          o.orderType === 'corretiva' ||
          o.orderType === 'emergencial' ||
          o.priority === 'critica' ||
          o.isRework
      );

      const preventiveOrders = assetOrders.filter((o) => o.orderType === 'preventiva');
      const reworkOrders = assetOrders.filter((o) => o.isRework);

      // Unit name
      const unit = units.find((u) => u.id === asset.unitId);
      const unitName = unit ? `${unit.name} (${unit.code})` : 'Unidade Matriz';

      // Determine last maintenance date
      let lastDateObj: Date | null = null;
      if (asset.lastMaintenanceDate) {
        lastDateObj = new Date(asset.lastMaintenanceDate);
      }
      assetOrders.forEach((o) => {
        const orderDateStr = o.actualEndDate || o.actualStartDate || o.scheduledStartDate || o.createdAt;
        if (orderDateStr) {
          const d = new Date(orderDateStr);
          if (!lastDateObj || d.getTime() > lastDateObj.getTime()) {
            lastDateObj = d;
          }
        }
      });

      const daysSinceLastMaintenance = lastDateObj
        ? Math.max(1, Math.round((today.getTime() - lastDateObj.getTime()) / (1000 * 3600 * 24)))
        : 45;

      // MTBF (Mean Time Between Failures)
      let mtbfDays = 60; // base default
      if (asset.category.includes('Solda')) mtbfDays = 45;
      if (asset.category.includes('Conformação') || asset.category.includes('Caldeiraria')) mtbfDays = 55;
      if (asset.category.includes('Corte')) mtbfDays = 50;
      if (asset.category.includes('Utilidades')) mtbfDays = 85;
      if (asset.category.includes('Usinagem')) mtbfDays = 75;

      // Adjust MTBF if we have real historical corrective orders
      if (correctiveOrders.length >= 2) {
        const dates = correctiveOrders
          .map((o) => new Date(o.createdAt).getTime())
          .sort((a, b) => a - b);
        let totalDiff = 0;
        for (let i = 1; i < dates.length; i++) {
          totalDiff += (dates[i] - dates[i - 1]) / (1000 * 3600 * 24);
        }
        mtbfDays = Math.max(15, Math.round(totalDiff / (dates.length - 1)));
      } else if (correctiveOrders.length === 1) {
        mtbfDays = Math.max(30, Math.round(mtbfDays * 0.85));
      }

      // MTTR (Mean Time To Repair)
      let totalRepairHours = 0;
      correctiveOrders.forEach((o) => {
        totalRepairHours += o.actualHours || o.estimatedHours || 4;
      });
      const mttrHours =
        correctiveOrders.length > 0
          ? Math.round((totalRepairHours / correctiveOrders.length) * 10) / 10
          : 4.5;

      // Reliability cumulative failure hazard: P(t) = 1 - exp(-lambda * t)
      const lambda = 1 / mtbfDays;
      let prob30 = 1 - Math.exp(-lambda * daysSinceLastMaintenance);

      // Penalties for rework, excessive corrective ratio, occurrences
      const correctiveRatio = assetOrders.length > 0 ? correctiveOrders.length / assetOrders.length : 0.4;
      if (correctiveRatio > 0.5) prob30 += 0.12;
      if (reworkOrders.length > 0) prob30 += reworkOrders.length * 0.08;
      if (asset.status === 'em_manutencao') prob30 += 0.25;

      // Linked occurrences check
      const linkedOcc = occurrences.filter(
        (occ) => occ.assetId === asset.id || occ.description?.toLowerCase().includes(asset.tag.toLowerCase())
      );
      if (linkedOcc.length > 0) prob30 += linkedOcc.length * 0.05;

      // Clamp between 0.08 and 0.96
      prob30 = Math.min(0.96, Math.max(0.08, prob30));
      const prob60 = Math.min(0.98, Math.max(prob30 + 0.15, prob30 * 1.35));

      // Health Score: 100 - (prob30 * 100)
      const healthScore = Math.max(5, Math.min(100, Math.round((1 - prob30) * 100)));

      // Risk classification
      let riskLevel: 'critico' | 'moderado' | 'estavel' = 'estavel';
      if (prob30 >= 0.65 || daysSinceLastMaintenance > mtbfDays) {
        riskLevel = 'critico';
      } else if (prob30 >= 0.35 || daysSinceLastMaintenance > mtbfDays * 0.7) {
        riskLevel = 'moderado';
      }

      // Estimated days to next failure
      const estimatedDaysToFailure = Math.max(2, Math.round(mtbfDays - daysSinceLastMaintenance));

      // Failure modes by equipment category
      let commonFailureModes = [
        'Desgaste por atrito e fadiga de contato',
        'Vibração anormal em eixos e rolamentos',
        'Folga mecânica em guias prismáticas',
      ];
      let recommendedAction = 'Realizar lubrificação e reaperto dos mancais de fixação.';

      if (asset.category.includes('Solda') || asset.tag.startsWith('TIG')) {
        commonFailureModes = [
          'Degradação térmica do transformador / inversor',
          'Vazamento de gás argônio nas conexões da tocha',
          'Desgaste do eletrodo de tungstênio e bocal cerâmico',
        ];
        recommendedAction = 'Inspeção dielétrica do circuito de alta frequência e teste de estanqueidade no fluxo de purga.';
      } else if (asset.category.includes('Conformação') || asset.tag.startsWith('CAL')) {
        commonFailureModes = [
          'Vazamento no sistema hidráulico de pressão dos rolos',
          'Desgaste prematuro nas buchas de bronze sinterizado',
          'Descalibração angular na curvatura de chapas de inox 316L',
        ];
        recommendedAction = 'Análise de contaminação do óleo ISO VG 68 e calibração micrométrica dos cilindros de conformação.';
      } else if (asset.category.includes('Corte') || asset.tag.startsWith('DOB')) {
        commonFailureModes = [
          'Desgaste da matriz inferior e punção em V',
          'Desvio de paralelismo nos sensores lineares ópticos',
          'Aquecimento de válvulas proporcionais hidráulicas',
        ];
        recommendedAction = 'Revisão das válvulas direcionais e verificação de alinhamento com relógio comparador centesimal.';
      } else if (asset.category.includes('Utilidades') || asset.tag.startsWith('BMB')) {
        commonFailureModes = [
          'Cavitação e erosão no rotor de aço inox 316L',
          'Vazamento no selo mecânico sanitário de carbeto de silício',
          'Desalinhamento com aquecimento nos mancais do motor elétrico',
        ];
        recommendedAction = 'Substituição preventiva do selo mecânico e medição de vibração RMS com acelerômetro.';
      }

      return {
        asset,
        unitName,
        totalOrders: assetOrders.length,
        correctiveCount: correctiveOrders.length,
        preventiveCount: preventiveOrders.length,
        reworkCount: reworkOrders.length,
        daysSinceLastMaintenance,
        lastOrderDate: lastDateObj ? lastDateObj.toISOString().split('T')[0] : null,
        mtbfDays,
        mttrHours,
        failureProbabilityNext30Days: Math.round(prob30 * 100) / 100,
        failureProbabilityNext60Days: Math.round(prob60 * 100) / 100,
        healthScore,
        riskLevel,
        estimatedDaysToFailure,
        recommendedAction,
        commonFailureModes,
      };
    });
  }, [displayAssets, orders, occurrences, units]);

  // Filtered predictions
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      if (riskFilter !== 'todos' && p.riskLevel !== riskFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTag = p.asset.tag.toLowerCase().includes(q);
        const matchName = p.asset.name.toLowerCase().includes(q);
        const matchCat = p.asset.category.toLowerCase().includes(q);
        const matchLoc = p.asset.location?.toLowerCase().includes(q);
        if (!matchTag && !matchName && !matchCat && !matchLoc) return false;
      }
      return true;
    });
  }, [predictions, riskFilter, searchTerm]);

  // Critical Alerts summary
  const criticalCount = predictions.filter((p) => p.riskLevel === 'critico').length;
  const moderateCount = predictions.filter((p) => p.riskLevel === 'moderado').length;
  const stableCount = predictions.filter((p) => p.riskLevel === 'estavel').length;
  const averageHealth = Math.round(
    predictions.reduce((acc, p) => acc + p.healthScore, 0) / (predictions.length || 1)
  );

  // 1-Click Proactive Preventive Work Order Generator
  const handleGenerateProactiveOrder = async (pred: AssetPrediction) => {
    if (!organization || !user) return;
    const unitId = pred.asset.unitId;
    if (!unitId || !units.some((unit) => unit.id === unitId)) {
      alert('O ativo não possui uma unidade válida vinculada. Corrija o cadastro do ativo antes de gerar a OS.');
      return;
    }
    if (!assets.some((asset) => asset.id === pred.asset.id)) {
      alert('O ativo não pertence à lista da empresa selecionada. Atualize os dados e tente novamente.');
      return;
    }
    setGeneratingOrder(true);

    try {
      const orderId = `os_pred_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const createdAt = new Date().toISOString();
      const statusQuery = query(collection(db, 'work_order_statuses'), where('orgId', '==', organization.id));
      const [statusSnap, existingOrders] = await Promise.all([
        getDocs(statusQuery),
        getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id))),
      ]);
      const statuses = statusSnap.docs.map((snapshot) => snapshot.data() as { id?: string; isInitial?: boolean; name?: string });
      const initialStatus = statuses.find((status) => status.isInitial && status.id)?.id;
      if (!initialStatus) {
        throw new Error('Configure um estado inicial no fluxo de OS antes de gerar uma ordem preventiva.');
      }
      const orderNumber = await runTransaction(db, async (tx) => {
        const unitRef = doc(db, 'units', unitId);
        const assetRef = doc(db, 'assets', pred.asset.id);
        const statusRef = doc(db, 'work_order_statuses', `${organization.id}_${initialStatus}`);
        const [unitSnap, assetSnap, statusConfigSnap] = await Promise.all([
          tx.get(unitRef),
          tx.get(assetRef),
          tx.get(statusRef),
        ]);
        if (!unitSnap.exists() || unitSnap.data()?.orgId !== organization.id) {
          throw new Error('A unidade vinculada ao ativo não pertence à empresa selecionada.');
        }
        if (!assetSnap.exists() || assetSnap.data()?.orgId !== organization.id || assetSnap.data()?.unitId !== unitId) {
          throw new Error('O ativo não pertence à unidade selecionada. Corrija o cadastro antes de gerar a OS.');
        }
        if (!statusConfigSnap.exists() || statusConfigSnap.data()?.orgId !== organization.id || statusConfigSnap.data()?.id !== initialStatus) {
          throw new Error('O estado inicial configurado não está disponível para esta empresa.');
        }

        const number = await nextOrderNumber(
          tx,
          db,
          organization.id,
          maxOrderSeq(existingOrders.docs.map((snapshot) => snapshot.data() as { orderNumber?: string }))
        );
        const newOrder: WorkOrder = {
          id: orderId,
          orgId: organization.id,
          unitId,
          assetId: pred.asset.id,
          orderNumber: number,
          title: `[Preditiva] Manutenção Preventiva - ${pred.asset.tag} ${pred.asset.name}`,
          description: `OS preventiva sugerida pelo Módulo de Inteligência Preditiva.\nProbabilidade estimada de falha nos próximos 30 dias: ${Math.round(pred.failureProbabilityNext30Days * 100)}%.\nMTBF médio: ${pred.mtbfDays} dias; tempo decorrido desde a última manutenção: ${pred.daysSinceLastMaintenance} dias.\n\nAção recomendada:\n${pred.recommendedAction}\n\nModos de falha observados:\n${pred.commonFailureModes.join('; ')}`,
          orderType: 'preventiva',
          priority: pred.riskLevel === 'critico' ? 'critica' : 'alta',
          status: initialStatus,
          requesterId: user.uid,
          requesterName: user.displayName || user.email || 'Operador',
          ...(Number.isFinite(pred.mttrHours) && pred.mttrHours > 0 ? { estimatedHours: pred.mttrHours } : {}),
          createdAt,
          updatedAt: createdAt,
        };
        const eventId = `${orderId}_created`;
        tx.set(doc(db, 'work_orders', orderId), newOrder);
        tx.set(doc(db, 'order_events', eventId), {
          id: eventId,
          orgId: organization.id,
          orderId,
          userId: user.uid,
          userName: user.displayName || user.email || 'Operador',
          eventType: 'criacao',
          description: `OS preventiva ${number} gerada a partir de análise preditiva do ativo ${pred.asset.tag}.`,
          newStatus: initialStatus,
          timestamp: createdAt,
        });
        return number;
      });

      try {
        await logAudit(
          'Manutenção Preditiva',
          'Disparo de OS Preventiva',
          `OS ${orderNumber} criada para o ativo ${pred.asset.tag} com risco estimado de ${Math.round(pred.failureProbabilityNext30Days * 100)}% nos próximos 30 dias.`,
          orderId
        );
      } catch (auditError) {
        console.warn('A OS foi criada, mas a auditoria complementar falhou:', auditError);
      }

      setSuccessToast(`OS Preventiva ${orderNumber} criada para ${pred.asset.tag}.`);
      setTimeout(() => setSuccessToast(null), 5000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Erro ao gerar OS preventiva proativa:', err);
      alert(err instanceof Error ? err.message : 'Erro ao gerar Ordem de Serviço preventiva.');
    } finally {
      setGeneratingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between shadow-xl animate-in slide-in-from-top-2">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-950/60 via-[#121826] to-purple-950/40 p-5 rounded-2xl border border-blue-900/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px] font-bold uppercase tracking-wider">
              <Zap className="w-3 h-3" />
              <span>Engenharia de Confiabilidade & RCM</span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>Análise Preditiva de Falhas em Equipamentos</span>
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Algoritmo de previsão baseado na distribuição estatística de falhas (MTBF / MTTR), reincidência de corretivas e tempo decorrido desde a última intervenção.
            </p>
          </div>

        </div>

        {/* Global Reliability KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 text-[11px] block">Índice Médio de Saúde (Health)</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className={`text-2xl font-black ${averageHealth >= 70 ? 'text-emerald-400' : averageHealth >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {averageHealth}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Confiabilidade Global</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-red-900/30">
            <span className="text-slate-400 text-[11px] block">Alto Risco de Falha Imediata</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-black text-red-400">{criticalCount}</span>
              <span className="text-[10px] text-red-400 font-semibold">Exigem OS Preventiva</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-amber-900/30">
            <span className="text-slate-400 text-[11px] block">Atenção Moderada (30 Dias)</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-black text-amber-400">{moderateCount}</span>
              <span className="text-[10px] text-amber-300 font-semibold">Monitoramento Ativo</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-900/30">
            <span className="text-slate-400 text-[11px] block">Equipamentos Estáveis</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-black text-emerald-400">{stableCount}</span>
              <span className="text-[10px] text-emerald-300 font-semibold">Operação Segura</span>
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Alerts Feed Banner */}
      {criticalCount > 0 && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-200">
                Alerta Proativo de Engenharia: {criticalCount} equipamento(s) com risco iminente de parada
              </h4>
              <p className="text-xs text-red-300/80 mt-0.5">
                O tempo de operação sem revisão superou o MTBF projetado. Dispare ordens de manutenção preventiva antes que ocorra quebra em campo.
              </p>
            </div>
          </div>

          <button
            onClick={() => setRiskFilter('critico')}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer whitespace-nowrap self-end sm:self-auto shadow"
          >
            Ver Apenas Críticos
          </button>
        </div>
      )}

      {/* Controls: Search and Filters */}
      <div className="bg-[#121826] p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por tag (ex: CAL-01, TIG-04), nome da máquina ou setor..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setRiskFilter('todos')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              riskFilter === 'todos'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Todos ({predictions.length})
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('critico')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center space-x-1 ${
              riskFilter === 'critico'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-900 text-red-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>Crítico</span>
            <span className="text-[10px] opacity-80">({criticalCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('moderado')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center space-x-1 ${
              riskFilter === 'moderado'
                ? 'bg-amber-600 text-white shadow'
                : 'bg-slate-900 text-amber-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>Moderado</span>
            <span className="text-[10px] opacity-80">({moderateCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('estavel')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center space-x-1 ${
              riskFilter === 'estavel'
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-slate-900 text-emerald-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>Estável</span>
            <span className="text-[10px] opacity-80">({stableCount})</span>
          </button>
        </div>
      </div>

      {/* Equipment Prediction Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPredictions.map((pred) => {
          const probPercent = Math.round(pred.failureProbabilityNext30Days * 100);
          const isCritical = pred.riskLevel === 'critico';
          const isModerate = pred.riskLevel === 'moderado';

          return (
            <div
              key={pred.asset.id}
              className={`p-4 rounded-xl bg-[#121826] border flex flex-col justify-between transition-all hover:shadow-xl ${
                isCritical
                  ? 'border-red-800/80 shadow-red-950/20 ring-1 ring-red-500/30'
                  : isModerate
                  ? 'border-amber-800/60 shadow-amber-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Card Top Header */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-mono text-xs font-extrabold text-blue-400 bg-blue-950/70 border border-blue-800/60 px-2 py-0.5 rounded">
                        {pred.asset.tag}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                          isCritical
                            ? 'bg-red-950 text-red-300 border-red-800'
                            : isModerate
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {isCritical ? 'Risco Crítico' : isModerate ? 'Risco Moderado' : 'Estável'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white truncate" title={pred.asset.name}>
                      {pred.asset.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {pred.asset.category} • {pred.asset.location || pred.unitName}
                    </p>
                  </div>

                  {/* Health Score Pill */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 block">Health Score</span>
                    <span
                      className={`text-lg font-black ${
                        pred.healthScore >= 70
                          ? 'text-emerald-400'
                          : pred.healthScore >= 45
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {pred.healthScore}%
                    </span>
                  </div>
                </div>

                {/* Probability Bar */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Probabilidade de Falha (30 dias)</span>
                    <span
                      className={`font-mono font-bold ${
                        isCritical ? 'text-red-400' : isModerate ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {probPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCritical
                          ? 'bg-gradient-to-r from-red-600 to-rose-500'
                          : isModerate
                          ? 'bg-gradient-to-r from-amber-600 to-yellow-500'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-500'
                      }`}
                      style={{ width: `${probPercent}%` }}
                    />
                  </div>
                </div>

                {/* Reliability Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 mt-3.5 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">MTBF</span>
                    <span className="font-mono font-bold text-slate-200">{pred.mtbfDays}d</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">tempo p/ falha</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Sem Revisão</span>
                    <span
                      className={`font-mono font-bold ${
                        pred.daysSinceLastMaintenance > pred.mtbfDays
                          ? 'text-red-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {pred.daysSinceLastMaintenance}d
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">desde última OS</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">MTTR Médio</span>
                    <span className="font-mono font-bold text-slate-200">{pred.mttrHours}h</span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">tempo reparo</span>
                  </div>
                </div>

                {/* Diagnostic & Action Recommendation */}
                <div className="mt-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] space-y-1">
                  <span className="font-bold text-slate-300 block flex items-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    <span>Ação Preventiva Recomendada:</span>
                  </span>
                  <p className="text-slate-400 leading-snug">{pred.recommendedAction}</p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAssetPrediction(pred)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>Diagnóstico</span>
                </button>

                <button
                  type="button"
                  disabled={generatingOrder}
                  onClick={() => handleGenerateProactiveOrder(pred)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-md ${
                    isCritical
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                  title="Gera uma Ordem de Serviço Preventiva Proativa imediatamente"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Gerar OS Preventiva</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Equipment Deep-Dive Modal */}
      {selectedAssetPrediction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-mono text-sm font-bold text-blue-400 bg-blue-950 px-2.5 py-0.5 rounded border border-blue-800">
                    {selectedAssetPrediction.asset.tag}
                  </span>
                  <span className="text-slate-400 font-semibold">{selectedAssetPrediction.asset.category}</span>
                </div>
                <h3 className="text-base font-bold text-white">{selectedAssetPrediction.asset.name}</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Modelo: {selectedAssetPrediction.asset.model || 'Padrão Inox'} • Nº Série:{' '}
                  {selectedAssetPrediction.asset.serialNumber || 'N/A'} • Localização:{' '}
                  {selectedAssetPrediction.asset.location || 'Fábrica'}
                </p>
              </div>

              <button
                onClick={() => setSelectedAssetPrediction(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Diagnostic Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Risco Próximos 30d</span>
                <span className="text-lg font-bold text-red-400">
                  {Math.round(selectedAssetPrediction.failureProbabilityNext30Days * 100)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Risco Próximos 60d</span>
                <span className="text-lg font-bold text-amber-400">
                  {Math.round(selectedAssetPrediction.failureProbabilityNext60Days * 100)}%
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Tempo Médio Falhas (MTBF)</span>
                <span className="text-lg font-bold text-blue-400 font-mono">
                  {selectedAssetPrediction.mtbfDays} dias
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 text-[10px] block">Tempo Médio Reparo (MTTR)</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {selectedAssetPrediction.mttrHours} horas
                </span>
              </div>
            </div>

            {/* Common Failure Modes & Symptoms */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Principais Mecanismos de Falha Identificados para este Tipo de Ativo</span>
              </h4>
              <ul className="space-y-1.5 text-slate-300 pl-2">
                {selectedAssetPrediction.commonFailureModes.map((mode, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="text-blue-400 shrink-0 font-bold">•</span>
                    <span>{mode}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommended Protocol */}
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/40 space-y-1.5">
              <h4 className="font-bold text-blue-300 flex items-center space-x-1.5">
                <Wrench className="w-4 h-4 text-blue-400" />
                <span>Protocolo de Intervenção Preventiva Sugerido</span>
              </h4>
              <p className="text-slate-300 leading-relaxed">
                {selectedAssetPrediction.recommendedAction}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">
                Última OS registrada: {selectedAssetPrediction.lastOrderDate || 'Sem histórico recente'}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedAssetPrediction(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleGenerateProactiveOrder(selectedAssetPrediction);
                    setSelectedAssetPrediction(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 cursor-pointer shadow-md"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Gerar OS Preventiva Agora</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
