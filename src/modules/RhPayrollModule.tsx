import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Calculator,
  History,
  FileBarChart,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  HardHat,
  Link2,
} from 'lucide-react';
import type { FieldWorker } from '../types';
import {
  RhEmployee,
  RhThirteenthCalculation,
  RhCalculationBatch,
  RhImportBatch,
} from '../types/rhPayroll';
import {
  subscribeRhEmployees,
  subscribeRhFieldWorkers,
  subscribeRhCalculations,
  subscribeRhBatches,
  subscribeRhImports,
  saveRhEmployee,
  deleteRhEmployee,
  saveRhCalculation,
  calculateEmployeeThirteenth,
  syncAllRhEmployeesToFieldWorkers,
  syncRhDirectory,
} from '../services/rhPayrollService';
import { buildRhLegacyAuditReport } from '../services/rhLegacyAudit';
import { RhDashboard } from '../components/rhPayroll/RhDashboard';
import { RhEmployeesManager } from '../components/rhPayroll/RhEmployeesManager';
import { RhSpreadsheetImport } from '../components/rhPayroll/RhSpreadsheetImport';
import { RhCalculationEngine } from '../components/rhPayroll/RhCalculationEngine';
import { RhCalculationHistory } from '../components/rhPayroll/RhCalculationHistory';
import { RhReportsManager } from '../components/rhPayroll/RhReportsManager';
import { RhDemonstrativoModal } from '../components/rhPayroll/RhDemonstrativoModal';
import { RhOnboardingManager } from '../components/rhPayroll/RhOnboardingManager';
import { RhLegacyPendenciesPanel } from '../components/rhPayroll/RhLegacyPendenciesPanel';

export type RhSubSection =
  | 'rh-painel'
  | 'rh-funcionarios'
  | 'rh-pendencias'
  | 'rh-admissoes'
  | 'rh-importacao'
  | 'rh-calculo'
  | 'rh-historico'
  | 'rh-relatorios'
  | 'rh-holerites';

interface RhPayrollModuleProps {
  activeSubSection?: RhSubSection;
  onNavigateSubSection?: (sec: RhSubSection) => void;
}

export const RhPayrollModule: React.FC<RhPayrollModuleProps> = ({
  activeSubSection = 'rh-painel',
  onNavigateSubSection,
}) => {
  const {
    organization,
    user,
    role,
    moduleLevel,
    units,
    contracts,
    selectedUnitId,
    selectedContractId,
    logAudit,
    areaLevel,
  } = useAuth();

  const canViewFinancials = moduleLevel('rh-holerites') >= 1;

  // Tab State
  const [currentTab, setCurrentTab] = useState<RhSubSection>(activeSubSection);
  const [referenceYear, setReferenceYear] = useState<number>(new Date().getFullYear());
  const [focusEmployeeId, setFocusEmployeeId] = useState<string | null>(null);

  // Data State
  const [employees, setEmployees] = useState<RhEmployee[]>([]);
  const [fieldWorkers, setFieldWorkers] = useState<FieldWorker[]>([]);
  const [calculations, setCalculations] = useState<RhThirteenthCalculation[]>([]);
  const [batches, setBatches] = useState<RhCalculationBatch[]>([]);
  const [imports, setImports] = useState<RhImportBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seedingDemo, setSeedingDemo] = useState<boolean>(false);

  // Holerite View Modal State
  const [showHoleriteModal, setShowHoleriteModal] = useState<boolean>(
    activeSubSection === 'rh-holerites'
  );
  const [selectedHoleriteCalcId, setSelectedHoleriteCalcId] = useState<string | undefined>(undefined);
  const [isSyncingWithObras, setIsSyncingWithObras] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleSyncWithObras = async () => {
    if (!organization?.id) return;
    setIsSyncingWithObras(true);
    setSyncToast(null);
    try {
      const count = await syncAllRhEmployeesToFieldWorkers(organization.id);
      setSyncToast(
        count > 0
          ? `${count} colaboradores sincronizados com sucesso para o Módulo 13 (Obras / Colaboradores de Campo).`
          : 'Todos os colaboradores de RH já constam no Módulo 13.'
      );
      setTimeout(() => setSyncToast(null), 5000);
    } catch (err: any) {
      setSyncToast(`Erro na sincronização: ${err.message || 'Falha de comunicação'}`);
    } finally {
      setIsSyncingWithObras(false);
    }
  };

  // Role Security Check
  // Super Admin/Master, Admin, RH/Gestor autorizado têm acesso; Operador/Almoxarife não têm acesso
  // Acesso por área: "ver" abre o RH, "editar" grava (Configurações → Acessos por área).
  const isAuthorized = areaLevel('rh') >= 1;
  const canEdit = areaLevel('rh') === 2;

  // Sync tab with props
  useEffect(() => {
    if (activeSubSection) {
      setCurrentTab(activeSubSection);
      if (activeSubSection === 'rh-holerites') {
        setShowHoleriteModal(true);
      }
    }
  }, [activeSubSection]);

  const handleTabChange = (tabId: RhSubSection) => {
    setCurrentTab(tabId);
    if (onNavigateSubSection) {
      onNavigateSubSection(tabId);
    }
    if (tabId === 'rh-holerites') {
      setShowHoleriteModal(true);
    }
  };

  // Subscriptions to Firestore Collections
  useEffect(() => {
    if (!organization?.id || !isAuthorized) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Mantém o diretório de pessoas (sem salários) em dia para as outras áreas.
    if (canEdit) syncRhDirectory(organization.id).catch((err) => console.warn('Diretório de pessoas não atualizado:', err));
    const unsubEmployees = subscribeRhEmployees(organization.id, (data) => {
      setEmployees(data);
    });

    const unsubFieldWorkers = subscribeRhFieldWorkers(organization.id, (data) => {
      setFieldWorkers(data);
    });

    const unsubCalculations = subscribeRhCalculations(organization.id, referenceYear, (data) => {
      setCalculations(data);
      setLoading(false);
    });

    const unsubBatches = subscribeRhBatches(organization.id, (data) => {
      setBatches(data);
    });

    const unsubImports = subscribeRhImports(organization.id, (data) => {
      setImports(data);
    });

    return () => {
      unsubEmployees();
      unsubFieldWorkers();
      unsubCalculations();
      unsubBatches();
      unsubImports();
    };
  }, [organization?.id, referenceYear, isAuthorized, canEdit]);

  const legacyAuditReport = useMemo(
    () =>
      buildRhLegacyAuditReport({
        orgId: organization?.id || '',
        employees,
        fieldWorkers,
      }),
    [organization?.id, employees, fieldWorkers]
  );

  // Save Employee
  const handleSaveEmployee = async (employee: RhEmployee) => {
    if (!organization?.id || !canEdit) return;
    await saveRhEmployee({ ...employee, orgId: organization.id });
    await logAudit(
      'RH / Salários',
      'Cadastro de Funcionário',
      `Colaborador ${employee.name} (${employee.registrationNumber}) salvo.`
    );
  };

  // Delete Employee
  const handleDeleteEmployee = async (id: string) => {
    if (!canEdit) return;
    await deleteRhEmployee(id);
    await logAudit('RH / Salários', 'Exclusão de Funcionário', `Colaborador com ID ${id} excluído.`);
  };

  // Save Calculation
  const handleSaveCalculation = async (calc: RhThirteenthCalculation) => {
    if (!organization?.id || !canEdit) return;
    await saveRhCalculation({ ...calc, orgId: organization.id });
  };

  // Batch Save Calculations
  const handleBatchSaveCalculations = async (calcs: RhThirteenthCalculation[]) => {
    if (!organization?.id || !canEdit) return;
    for (const c of calcs) {
      await saveRhCalculation({ ...c, orgId: organization.id });
    }
    await logAudit(
      'RH / Salários',
      'Recálculo em Lote',
      `Recálculo consolidado de 13º salário executado para ${calcs.length} colaboradores no exercício ${referenceYear}.`
    );
  };

  // Filtered by selected Contract and Unit if active
  const filteredEmployees = employees.filter((emp) => {
    if (selectedUnitId && selectedUnitId !== 'todas' && emp.unitId && emp.unitId !== selectedUnitId) {
      return false;
    }
    if (
      selectedContractId &&
      selectedContractId !== 'todos' &&
      emp.contractId &&
      emp.contractId !== selectedContractId
    ) {
      return false;
    }
    return true;
  });

  const filteredCalculations = calculations.filter((calc) => {
    if (
      selectedUnitId &&
      selectedUnitId !== 'todas' &&
      calc.unitId &&
      calc.unitId !== selectedUnitId
    ) {
      return false;
    }
    if (
      selectedContractId &&
      selectedContractId !== 'todos' &&
      calc.contractId &&
      calc.contractId !== selectedContractId
    ) {
      return false;
    }
    return true;
  });

  // Guard: Unauthorized Access (Operador / Almoxarife)
  if (!isAuthorized) {
    return (
      <div className="bg-[#121826] border border-rose-900/60 rounded-2xl p-8 text-center max-w-lg mx-auto mt-12 space-y-4 shadow-xl">
        <div className="p-3 bg-rose-950/60 text-rose-400 rounded-full w-14 h-14 mx-auto flex items-center justify-center border border-rose-800/60">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white">Acesso Restrito ao RH & Gestores</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          O módulo de <strong>RH / Salários e Provisionamento do 13º</strong> contém informações
          confidenciais de folha de pagamento e só pode ser acessado por Administradores, Gestores de RH
          ou Visualizadores devidamente autorizados na organização.
        </p>
        <div className="text-[11px] text-slate-500 font-mono">
          Seu perfil atual: <span className="text-amber-400 font-bold">{role}</span>
        </div>
      </div>
    );
  }

  const tabs: { id: RhSubSection; label: string; icon: any; badge?: number }[] = [
    { id: 'rh-painel', label: 'Painel RH/Salários', icon: LayoutDashboard },
    { id: 'rh-funcionarios', label: 'Funcionários', icon: Users },
    {
      id: 'rh-pendencias',
      label: 'Pendências Legadas',
      icon: ShieldAlert,
      badge: legacyAuditReport.summary.totalIssues,
    },
    { id: 'rh-admissoes', label: 'Admissão Digital (Links)', icon: Link2 },
    { id: 'rh-importacao', label: 'Importação de Planilha', icon: FileSpreadsheet },
    { id: 'rh-calculo', label: 'Cálculo do 13º', icon: Calculator },
    { id: 'rh-historico', label: 'Histórico de Cálculos', icon: History },
    { id: 'rh-relatorios', label: 'Relatórios', icon: FileBarChart },
    { id: 'rh-holerites', label: 'Demonstrativos/Holerites', icon: FileText },
  ];

  return (
    <div className="space-y-5">
      {/* Module Title & Context Header */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">RH / Salários & 13º Salário</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/80 text-blue-300 font-semibold border border-blue-700/50">
                  Exercício {referenceYear}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organização: <strong className="text-slate-200">{organization?.name}</strong> •
                Contrato / Unidade: {selectedUnitId === 'todas' ? 'Todas' : selectedUnitId}
              </p>
            </div>
          </div>

        </div>

        {/* Mandatory Module Disclaimer Banner */}
        <div className="p-2.5 bg-blue-950/40 border border-blue-900/60 rounded-lg text-xs text-blue-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>Nota Técnica Obrigatória:</strong> Pré-cálculo para conferência do RH/contabilidade. Não constitui folha de pagamento.
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            Tabela INSS 2025 • Carga 220h
          </span>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 custom-scrollbar border-t border-slate-800/80">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = currentTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
                {typeof t.badge === 'number' && t.badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Toast */}
      {syncToast && (
        <div className="p-3 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-xs text-indigo-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncToast}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      {loading ? (
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <span>Sincronizando dados de RH e 13º Salário...</span>
        </div>
      ) : (
        <div>
          {/* 1. Painel RH/Salários */}
          {currentTab === 'rh-painel' && (
            <RhDashboard
              employees={filteredEmployees}
              calculations={filteredCalculations}
              referenceYear={referenceYear}
              onNavigateTab={(tab) => handleTabChange(`rh-${tab}` as RhSubSection)}
              canViewFinancials={canViewFinancials}
              onQuickRecalculate={() => handleTabChange('rh-calculo')}
              orgName={organization?.name || ''}
              onSyncWithConstruction={handleSyncWithObras}
              isSyncingWithConstruction={isSyncingWithObras}
            />
          )}

          {/* 2. Funcionários */}
          {currentTab === 'rh-funcionarios' && (
            <RhEmployeesManager
              employees={filteredEmployees}
              units={units}
              contracts={contracts}
              orgName={organization?.name || ''}
              focusEmployeeId={focusEmployeeId}
              onFocusHandled={() => setFocusEmployeeId(null)}
              onSaveEmployee={handleSaveEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              canEdit={canEdit}
              canViewFinancials={canViewFinancials}
              onNavigateToImport={() => handleTabChange('rh-importacao')}
              onNavigateToOnboarding={() => handleTabChange('rh-admissoes')}
            />
          )}

          {/* 2.0 Auditoria de Pendências Legadas */}
          {currentTab === 'rh-pendencias' && (
            <RhLegacyPendenciesPanel
              report={legacyAuditReport}
              orgName={organization?.name || ''}
              onReviewEmployee={(empId) => {
                setFocusEmployeeId(empId);
                handleTabChange('rh-funcionarios');
              }}
            />
          )}

          {/* 2.1 Admissão Digital & Links de Cadastro Único */}
          {currentTab === 'rh-admissoes' && (
            <RhOnboardingManager
              currentOrgId={organization?.id || ''}
              orgName={organization?.name || ''}
              userEmail={user?.email || ''}
              userName={user?.displayName || 'Recursos Humanos'}
              units={units}
              contracts={contracts}
              canEdit={canEdit}
              onEmployeeApproved={handleSaveEmployee}
              onNavigateToEmployees={() => handleTabChange('rh-funcionarios')}
            />
          )}

          {/* 3. Importação de Planilha */}
          {currentTab === 'rh-importacao' && (
            <RhSpreadsheetImport
              existingEmployees={employees}
              currentOrgId={organization?.id || ''}
              orgName={organization?.name || ''}
              userEmail={user?.email || ''}
              userName={user?.displayName || 'Gestor RH'}
              onImportCompleted={() => handleTabChange('rh-calculo')}
              canImport={canEdit}
            />
          )}

          {/* 4. Cálculo do 13º */}
          {currentTab === 'rh-calculo' && (
            <RhCalculationEngine
              employees={filteredEmployees}
              calculations={filteredCalculations}
              referenceYear={referenceYear}
              onReferenceYearChange={setReferenceYear}
              onSaveCalculation={handleSaveCalculation}
              onBatchSaveCalculations={handleBatchSaveCalculations}
              canEdit={canEdit}
              canViewFinancials={canViewFinancials}
              userEmail={user?.email || ''}
            />
          )}

          {/* 5. Histórico de Cálculos */}
          {currentTab === 'rh-historico' && (
            <RhCalculationHistory
              batches={batches}
              imports={imports}
              calculations={calculations}
              canViewFinancials={canViewFinancials}
            />
          )}

          {/* 6. Relatórios */}
          {currentTab === 'rh-relatorios' && (
            <RhReportsManager
              calculations={filteredCalculations}
              employees={filteredEmployees}
              units={units}
              contracts={contracts}
              referenceYear={referenceYear}
              canViewFinancials={canViewFinancials}
              orgName={organization?.name || ''}
            />
          )}

          {/* 7. Demonstrativos / Holerites Direct View */}
          {currentTab === 'rh-holerites' && (
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-8 text-center space-y-4">
              <div className="p-4 bg-blue-950/60 text-blue-400 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center border border-blue-800/40">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Emissão de Demonstrativos & Holerites de 13º Salário
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Gere e imprima recibos individuais ou em lote com a discriminação oficial das parcelas,
                  dedução do INSS 2025 e verbas complementares.
                </p>
              </div>
              <button
                onClick={() => setShowHoleriteModal(true)}
                disabled={calculations.length === 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50"
              >
                Abrir Visualizador de Holerites ({calculations.length} disponíveis)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demonstrativo Modal (Individual or Batch) */}
      {showHoleriteModal && (
        <RhDemonstrativoModal
          calculations={filteredCalculations}
          initialCalculationId={selectedHoleriteCalcId}
          onClose={() => {
            setShowHoleriteModal(false);
            if (currentTab === 'rh-holerites') {
              setCurrentTab('rh-painel');
            }
          }}
          canViewFinancials={canViewFinancials}
          orgName={organization?.name || ''}
        />
      )}
    </div>
  );
};
