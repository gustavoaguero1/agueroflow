import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Download,
  Eye,
  ShieldAlert,
  Info,
  Check,
  BarChart3,
  PieChart as PieIcon,
  Presentation,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  parseAgueroSpreadsheet,
  calculateEmployeeThirteenth,
  saveRhEmployee,
  saveRhCalculation,
  saveRhImportBatch,
  roundCurrency,
} from '../../services/rhPayrollService';
import { RhEmployee, RhSpreadsheetRowData, RhImportBatch } from '../../types/rhPayroll';

interface RhSpreadsheetImportProps {
  existingEmployees: RhEmployee[];
  currentOrgId: string;
  userEmail: string;
  userName?: string;
  onImportCompleted: () => void;
  canImport: boolean;
}

export const RhSpreadsheetImport: React.FC<RhSpreadsheetImportProps> = ({
  existingEmployees,
  currentOrgId,
  userEmail,
  userName = 'Gestor de RH',
  onImportCompleted,
  canImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<{
    sheets: string[];
    activeSheet: string;
    rows: RhSpreadsheetRowData[];
    detectedMode: 'with_values' | 'cadastral_only';
    summary: {
      total: number;
      valid: number;
      invalid: number;
      withReferenceValues: number;
    };
  } | null>(null);

  // User Chosen Mode and Action
  const [selectedMode, setSelectedMode] = useState<'with_values' | 'cadastral_only'>('with_values');
  const [actionOption, setActionOption] = useState<'create_only' | 'update_existing' | 'preview_only'>('update_existing');
  const [viewTab, setViewTab] = useState<'apresentacao' | 'tabela'>('apresentacao');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importSuccessResult, setImportSuccessResult] = useState<string | null>(null);

  // Row Filter in Table Preview
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'invalid'>('all');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setErrorMessage(null);
    setImportSuccessResult(null);
    setLoading(true);

    try {
      const result = await parseAgueroSpreadsheet(selectedFile);
      setParsedData(result);
      setSelectedMode(result.detectedMode);
      setViewTab('apresentacao'); // Mostra diretamente a visão de apresentação executiva ao carregar!
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar planilha.');
      setParsedData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'FUNCIONÁRIO', // A
      'Valor Hora Carteira', // B
      'Valor Hora por fora', // C
      'Data de admissão', // D
      'Qnt MÊS', // E
      'Valor total Carteira', // F
      'Valor total Por Fora', // G
      'Carteira, em 1ª Parcela', // H
      'Por Fora, em 1ª Parcela', // I
      'Carteira, em 2ª Parcela', // J
      'Por Fora, em 2ª Parcela', // K
      'Total 1ª Parcela', // L
      'DESCONTOS 2ª PARCELA', // M
      'Total 2ª Parcela', // N
      'EMPRESA', // O
      'AUXILIAR', // P (sem significado financeiro)
      'CODIGO', // Q
    ];

    const sampleRow = [
      'Exemplo Colaborador Aguero',
      22.5,
      5.0,
      '15/03/2024',
      12,
      4950.0,
      1100.0,
      2475.0,
      550.0,
      2475.0,
      550.0,
      3025.0,
      485.25,
      2539.75,
      'Aguero Inox',
      '',
      '198',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '13o_Salario_Modelo');
    XLSX.writeFile(wb, 'modelo_importacao_13_salario_agueroflow.xlsx');
  };

  const handleExecuteImport = async () => {
    if (!parsedData || !canImport || !currentOrgId) return;

    if (actionOption === 'preview_only') {
      alert('Modo apenas pré-visualização ativo. Nenhuma alteração foi gravada no banco.');
      return;
    }

    setLoading(true);
    setImportProgress(0);
    setErrorMessage(null);

    const validRows = parsedData.rows.filter((r) => r.isValid);
    let accepted = 0;
    let rejected = parsedData.rows.length - validRows.length;
    let duplicated = 0;
    const now = new Date().toISOString();
    const runId = `run_imp_${Date.now()}`;

    try {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const normName = row.nome.trim().toLowerCase();
        const existing = existingEmployees.find(
          (e) => e.name.trim().toLowerCase() === normName
        );

        if (existing && actionOption === 'create_only') {
          duplicated++;
          continue;
        }

        // Gera ID único por funcionário (baseado no nome do colaborador)
        const nameSlug = normName.replace(/[^a-z0-9]/g, '_').substring(0, 30);
        const empId = existing
          ? existing.id
          : `emp_${nameSlug}_${Date.now().toString(36)}_${i}`;

        const baseCarteira =
          row.valorTotalCarteira > 0
            ? row.valorTotalCarteira
            : roundCurrency(row.valorHoraCarteira * 220);
        const basePorFora =
          row.valorTotalPorFora > 0
            ? row.valorTotalPorFora
            : roundCurrency(row.valorHoraPorFora * 220);

        const codigoObra = row.codigoObra || row.codigoMatricula || '198';

        const employeeToSave: RhEmployee = {
          id: empId,
          orgId: currentOrgId,
          codigoObra,
          registrationNumber: codigoObra,
          name: row.nome.trim(),
          admissionDate: row.admissao || '2024-01-01',
          active: true,
          department: existing?.department || 'Operações & Montagem',
          role: existing?.role || 'Colaborador',
          companyName: row.empresa || 'Aguero Inox',
          unitId: existing?.unitId || null,
          contractId: existing?.contractId || null,
          hourlyRateCarteira: row.valorHoraCarteira,
          hourlyRatePorFora: row.valorHoraPorFora,
          monthlyHours: 220,
          baseSalaryCarteira: baseCarteira,
          baseSalaryPorFora: basePorFora,
          porForaEligible: row.valorHoraPorFora > 0,
          notes: `Alocado na Obra ${codigoObra}. Importado via planilha '${file?.name}' em ${new Date().toLocaleDateString('pt-BR')}.`,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };

        await saveRhEmployee(employeeToSave);

        // Se estiver em modo A (com valores de referência), grava a memória de auditoria
        const importedRef =
          selectedMode === 'with_values' && row.hasReferenceValues
            ? {
                importedMonths: row.qntMes,
                importedBaseCarteira: row.valorTotalCarteira,
                importedBasePorFora: row.valorTotalPorFora,
                importedFirstInstallmentCarteira: row.carteira1aParcela,
                importedFirstInstallmentPorFora: row.porFora1aParcela,
                importedFirstInstallmentTotal: row.total1aParcela,
                importedSecondInstallmentCarteira: row.carteira2aParcela,
                importedSecondInstallmentPorFora: row.porFora2aParcela,
                importedSecondInstallmentDiscounts: row.descontos2aParcela,
                importedSecondInstallmentTotal: row.total2aParcela,
              }
            : undefined;

        const calc = calculateEmployeeThirteenth({
          employee: employeeToSave,
          referenceYear: 2025,
          monthlyHours: 220,
          importedRef,
          porForaConfirmed: true,
          runId,
        });

        await saveRhCalculation(calc);
        accepted++;
        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      }

      // Salva o registro de auditoria do lote de importação
      const importBatchRecord: RhImportBatch = {
        id: `imp_batch_${Date.now()}`,
        orgId: currentOrgId,
        fileName: file?.name || '13o_salario.xlsx',
        fileSize: file?.size,
        importMode: selectedMode,
        actionTaken: actionOption,
        totalRows: parsedData.rows.length,
        validRows: accepted,
        rejectedRows: rejected,
        duplicateRows: duplicated,
        ignoredRows: 0,
        warningsCount: parsedData.rows.reduce((sum, r) => sum + r.validationWarnings.length, 0),
        divergenceCount: 0,
        status: rejected > 0 ? 'com_erros' : 'concluido',
        importedBy: userEmail,
        importedByName: userName,
        importedAt: now,
      };

      await saveRhImportBatch(importBatchRecord);
      setImportSuccessResult(
        `Importação concluída com sucesso! ${accepted} colaboradores e cálculos processados.`
      );
      onImportCompleted();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro durante a importação.');
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  // Cálculos consolidados da planilha carregada para gerar os gráficos
  const validRows = parsedData?.rows.filter((r) => r.isValid) || [];
  const totalBaseCarteira = validRows.reduce(
    (sum, r) => sum + (r.valorTotalCarteira > 0 ? r.valorTotalCarteira : r.valorHoraCarteira * 220),
    0
  );
  const totalBasePorFora = validRows.reduce(
    (sum, r) => sum + (r.valorTotalPorFora > 0 ? r.valorTotalPorFora : r.valorHoraPorFora * 220),
    0
  );

  // Simula cálculos AgueroFlow em memória para comparação imediata no gráfico
  const simulatedCalcs = validRows.map((r, idx) => {
    const codObra = r.codigoObra || r.codigoMatricula || '198';
    const dummyEmp: RhEmployee = {
      id: `temp_${idx}_${r.nome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      orgId: currentOrgId,
      codigoObra: codObra,
      registrationNumber: codObra,
      name: r.nome,
      admissionDate: r.admissao || '2024-01-01',
      active: true,
      department: 'Geral',
      role: 'Colaborador',
      companyName: r.empresa || 'Aguero Inox',
      unitId: null as any,
      contractId: null as any,
      hourlyRateCarteira: r.valorHoraCarteira,
      hourlyRatePorFora: r.valorHoraPorFora,
      monthlyHours: 220,
      baseSalaryCarteira: r.valorTotalCarteira > 0 ? r.valorTotalCarteira : r.valorHoraCarteira * 220,
      baseSalaryPorFora: r.valorTotalPorFora > 0 ? r.valorTotalPorFora : r.valorHoraPorFora * 220,
      porForaEligible: r.valorHoraPorFora > 0,
      createdAt: '',
      updatedAt: '',
    };

    const impRef =
      selectedMode === 'with_values' && r.hasReferenceValues
        ? {
            importedMonths: r.qntMes,
            importedBaseCarteira: r.valorTotalCarteira,
            importedBasePorFora: r.valorTotalPorFora,
            importedFirstInstallmentCarteira: r.carteira1aParcela,
            importedFirstInstallmentPorFora: r.porFora1aParcela,
            importedFirstInstallmentTotal: r.total1aParcela,
            importedSecondInstallmentCarteira: r.carteira2aParcela,
            importedSecondInstallmentPorFora: r.porFora2aParcela,
            importedSecondInstallmentDiscounts: r.descontos2aParcela,
            importedSecondInstallmentTotal: r.total2aParcela,
          }
        : undefined;

    return calculateEmployeeThirteenth({
      employee: dummyEmp,
      referenceYear: 2025,
      monthlyHours: 220,
      importedRef: impRef,
      porForaConfirmed: true,
    });
  });

  const simTotal1aParc = simulatedCalcs.reduce((sum, c) => sum + c.firstInstallmentTotal, 0);
  const simTotal2aParc = simulatedCalcs.reduce((sum, c) => sum + c.secondInstallmentTotalNet, 0);
  const simTotalInss = simulatedCalcs.reduce((sum, c) => sum + c.inssDeductionCarteira, 0);
  const simTotalPorFora = simulatedCalcs.reduce(
    (sum, c) => sum + c.firstInstallmentPorFora + c.secondInstallmentPorFora,
    0
  );
  const simTotalGeral = simTotal1aParc + simTotal2aParc;

  // Dados do gráfico de confronto Planilha vs Calculado (Modo A)
  const comparisonBarData = [
    {
      metrica: '1ª Parcela',
      'Planilha Importada': Math.round(validRows.reduce((sum, r) => sum + r.total1aParcela, 0)),
      'Cálculo AgueroFlow': Math.round(simTotal1aParc),
    },
    {
      metrica: '2ª Parcela Líquida',
      'Planilha Importada': Math.round(validRows.reduce((sum, r) => sum + r.total2aParcela, 0)),
      'Cálculo AgueroFlow': Math.round(simTotal2aParc),
    },
    {
      metrica: 'Total Geral 13º',
      'Planilha Importada': Math.round(
        validRows.reduce((sum, r) => sum + r.total1aParcela + r.total2aParcela, 0)
      ),
      'Cálculo AgueroFlow': Math.round(simTotalGeral),
    },
  ];

  // Dados do gráfico de parcelas projetadas (Modo B)
  const projectionBarData = [
    {
      etapa: '1ª Parcela (Adiantamento)',
      CLT: Math.round(simulatedCalcs.reduce((sum, c) => sum + c.firstInstallmentCarteira, 0)),
      'Por Fora': Math.round(simulatedCalcs.reduce((sum, c) => sum + c.firstInstallmentPorFora, 0)),
    },
    {
      etapa: '2ª Parcela (Quitação Líq)',
      CLT: Math.round(simulatedCalcs.reduce((sum, c) => sum + c.secondInstallmentNetCarteira, 0)),
      'Por Fora': Math.round(simulatedCalcs.reduce((sum, c) => sum + c.secondInstallmentPorFora, 0)),
    },
  ];

  // Dados para Donut de Distribuição
  const donutData = [
    {
      name: 'CLT Líquido',
      value: Math.round(simulatedCalcs.reduce((sum, c) => sum + c.totalThirteenthCarteiraNet, 0)),
      color: '#10B981',
    },
    { name: 'Verba Complementar', value: Math.round(simTotalPorFora), color: '#8B5CF6' },
    { name: 'Retenção INSS', value: Math.round(simTotalInss), color: '#F59E0B' },
  ].filter((d) => d.value > 0);

  // Distribuição de avos
  const avosCounts: { [key: number]: number } = {};
  for (let i = 1; i <= 12; i++) avosCounts[i] = 0;
  validRows.forEach((r) => {
    const av = r.qntMes || 12;
    avosCounts[av] = (avosCounts[av] || 0) + 1;
  });

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {/* Informative Header with Specification Grounding */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-xl border border-emerald-800/50">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Importação Estruturada de Planilha (Aguero Inox — 13º Salário)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/50">
                  Colunas A–Q
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aceita colaboradores flexíveis (apenas carteira, apenas por fora ou ambos). Coluna P tratada como auxiliar.
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            Baixar Modelo Padrão (.xlsx)
          </button>
        </div>

        {/* Column Reference Legend */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs space-y-2">
          <span className="font-bold text-slate-300 block flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            Estrutura Reconhecida da Planilha Oficial (Colunas A–Q):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[10px] text-slate-400 font-mono">
            <span className="bg-slate-950 p-1 rounded">A: FUNCIONÁRIO</span>
            <span className="bg-slate-950 p-1 rounded">B: Vlr Hora Carteira</span>
            <span className="bg-slate-950 p-1 rounded">C: Vlr Hora Por Fora</span>
            <span className="bg-slate-950 p-1 rounded">D: Data Admissão</span>
            <span className="bg-slate-950 p-1 rounded">E: Qnt MÊS (Avos)</span>
            <span className="bg-slate-950 p-1 rounded">F: Base Carteira</span>
            <span className="bg-slate-950 p-1 rounded">G: Base Por Fora</span>
            <span className="bg-slate-950 p-1 rounded">H: 1ª Parc Carteira</span>
            <span className="bg-slate-950 p-1 rounded">I: 1ª Parc Por Fora</span>
            <span className="bg-slate-950 p-1 rounded">J: 2ª Parc Carteira</span>
            <span className="bg-slate-950 p-1 rounded">K: 2ª Parc Por Fora</span>
            <span className="bg-slate-950 p-1 rounded">L: Total 1ª Parcela</span>
            <span className="bg-slate-950 p-1 rounded">M: Descontos 2ª Parc</span>
            <span className="bg-slate-950 p-1 rounded">N: Total 2ª Parcela</span>
            <span className="bg-slate-950 p-1 rounded">O: EMPRESA</span>
            <span className="bg-amber-950/60 text-amber-300 p-1 rounded border border-amber-800/40">
              P: Auxiliar (Ignorada)
            </span>
            <span className="bg-slate-950 text-cyan-300 p-1 rounded font-bold">Q: CODIGO (Cód. Obra Alocada)</span>
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div
        className="bg-[#121826] border border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-8 text-center transition flex flex-col items-center justify-center space-y-3 cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx, .xls, .csv"
          className="hidden"
        />
        <div className="p-3 bg-blue-950/60 text-blue-400 rounded-full border border-blue-800/40">
          <Upload className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">
            {file ? file.name : 'Selecione ou arraste a planilha do 13º Salário'}
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou Valores Separados por Vírgula (.csv)
          </p>
        </div>
        {file && (
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">
            {(file.size / 1024).toFixed(1)} KB carregado
          </span>
        )}
      </div>

      {/* Error or Success Alerts */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {importSuccessResult && (
        <div className="p-3.5 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{importSuccessResult}</span>
        </div>
      )}

      {/* Configuration & Visual Presentation Section */}
      {parsedData && (
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          {/* Top Bar with Mode, Summary & View Switcher */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-bold text-white block">Aba Selecionada:</span>
              <span className="text-xs font-mono text-cyan-400">{parsedData.activeSheet}</span>
              <span className="text-[11px] text-slate-400 ml-2">
                ({parsedData.summary.valid} colaboradores válidos)
              </span>
            </div>

            {/* View Switcher: Apresentação vs Tabela */}
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              <button
                onClick={() => setViewTab('apresentacao')}
                className={`flex items-center gap-1.5 px-3.5 py-2 font-bold transition cursor-pointer ${
                  viewTab === 'apresentacao'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Presentation className="w-3.5 h-3.5" />
                Gráficos & Apresentação Executiva
              </button>
              <button
                onClick={() => setViewTab('tabela')}
                className={`flex items-center gap-1.5 px-3.5 py-2 font-bold transition cursor-pointer ${
                  viewTab === 'tabela'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Conferência Linha a Linha
              </button>
            </div>
          </div>

          {/* Dois Modos Obrigatórios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setSelectedMode('with_values')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedMode === 'with_values'
                  ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-950/30'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      selectedMode === 'with_values' ? 'text-blue-400' : 'text-slate-600'
                    }`}
                  />
                  Modo A: Planilha com Valores de Referência
                </span>
                <span className="text-[10px] bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded font-mono">
                  Auditoria & Confronto
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Preserva os valores importados da planilha como referência. Executa o cálculo
                independente do AgueroFlow e gera gráficos comparativos de aferição.
              </p>
            </div>

            <div
              onClick={() => setSelectedMode('cadastral_only')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedMode === 'cadastral_only'
                  ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-950/30'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      selectedMode === 'cadastral_only' ? 'text-blue-400' : 'text-slate-600'
                    }`}
                  />
                  Modo B: Planilha sem Valores Pré-Calculados
                </span>
                <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded font-mono">
                  Projeção Automática
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Aceita dados cadastrais e valores por hora (flexível: carteira e/ou por fora). Calcula
                automaticamente a provisão do 13º com a tabela oficial progressiva do INSS 2025.
              </p>
            </div>
          </div>

          {/* VISÃO 1: GRÁFICOS & APRESENTAÇÃO EXECUTIVA (VISUALMENTE BONITA PARA APRESENTAR) */}
          {viewTab === 'apresentacao' && (
            <div className="space-y-6 pt-2">
              {/* Executive KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block font-medium">Colaboradores Válidos</span>
                  <span className="text-2xl font-bold text-white mt-1 block">
                    {validRows.length}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {parsedData.summary.invalid > 0
                      ? `${parsedData.summary.invalid} com avisos/pendências`
                      : '100% de cadastros íntegros'}
                  </span>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block font-medium">1ª Parcela (Adiantamento)</span>
                  <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                    {formatCurrency(simTotal1aParc)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">50% sem desconto de INSS</span>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block font-medium">2ª Parcela (Quitação Líq)</span>
                  <span className="text-xl font-bold font-mono text-cyan-400 mt-1 block">
                    {formatCurrency(simTotal2aParc)}
                  </span>
                  <span className="text-[10px] text-amber-400 mt-0.5 block">
                    INSS Retido: -{formatCurrency(simTotalInss)}
                  </span>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400 block font-medium">Custo Total Projetado</span>
                  <span className="text-xl font-bold font-mono text-white mt-1 block">
                    {formatCurrency(simTotalGeral)}
                  </span>
                  <span className="text-[10px] text-purple-400 mt-0.5 block">
                    Verba Complementar: {formatCurrency(simTotalPorFora)}
                  </span>
                </div>
              </div>

              {/* Gráficos em Grade para Apresentação */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Gráfico 1: Confronto ou Projeção de Parcelas */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                      {selectedMode === 'with_values'
                        ? 'Comparativo: Planilha Importada vs Cálculo AgueroFlow'
                        : 'Projeção de Desembolso: 1ª Parcela vs 2ª Parcela'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {selectedMode === 'with_values' ? 'Auditoria Aritmética' : 'Simulação Oficial'}
                    </span>
                  </div>

                  <div className="h-64 w-full pt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      {selectedMode === 'with_values' ? (
                        <BarChart data={comparisonBarData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                          <XAxis dataKey="metrica" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(val: any) => formatCurrency(Number(val))}
                            contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="Planilha Importada" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Cálculo AgueroFlow" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <BarChart data={projectionBarData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                          <XAxis dataKey="etapa" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(val: any) => formatCurrency(Number(val))}
                            contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="CLT" fill="#10B981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Por Fora" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gráfico 2: Donut de Repartição Orçamentária */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <PieIcon className="w-4 h-4 text-emerald-400" />
                      Repartição do Custo da Planilha
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      {formatCurrency(simTotalGeral + simTotalInss)}
                    </span>
                  </div>

                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={4}
                        >
                          {donutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => formatCurrency(Number(val))}
                          contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VISÃO 2: TABELA DE CONFERÊNCIA LINHA A LINHA */}
          {viewTab === 'tabela' && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-900/90 p-3 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  Registros Identificados ({parsedData.rows.length} linhas)
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2 py-1 rounded text-[11px] ${
                      previewFilter === 'all'
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setPreviewFilter('valid')}
                    className={`px-2 py-1 rounded text-[11px] ${
                      previewFilter === 'valid'
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    Válidas ({parsedData.summary.valid})
                  </button>
                  {parsedData.summary.invalid > 0 && (
                    <button
                      onClick={() => setPreviewFilter('invalid')}
                      className={`px-2 py-1 rounded text-[11px] ${
                        previewFilter === 'invalid'
                          ? 'bg-rose-600 text-white font-semibold'
                          : 'text-slate-400'
                      }`}
                    >
                      Inconsistências ({parsedData.summary.invalid})
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0">
                      <th className="py-2 px-2.5">Linha</th>
                      <th className="py-2 px-2.5">Cód. Obra (Q)</th>
                      <th className="py-2 px-2.5">Funcionário (A)</th>
                      <th className="py-2 px-2.5">Admissão (D)</th>
                      <th className="py-2 px-2.5 text-right">Vlr Hora CLT (B)</th>
                      <th className="py-2 px-2.5 text-right">Vlr Hora Fora (C)</th>
                      <th className="py-2 px-2.5 text-center">Avos (E)</th>
                      <th className="py-2 px-2.5 text-right">1ª Parcela (L)</th>
                      <th className="py-2 px-2.5 text-right">2ª Parcela (N)</th>
                      <th className="py-2 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {parsedData.rows
                      .filter((r) => {
                        if (previewFilter === 'valid') return r.isValid;
                        if (previewFilter === 'invalid') return !r.isValid;
                        return true;
                      })
                      .slice(0, 100)
                      .map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={`hover:bg-slate-800/40 transition ${
                            !row.isValid ? 'bg-rose-950/20 text-rose-300' : 'text-slate-300'
                          }`}
                        >
                          <td className="py-2 px-2.5 text-slate-500">#{row.rowNumber}</td>
                          <td className="py-2 px-2.5 font-bold text-cyan-400">{row.codigoMatricula}</td>
                          <td className="py-2 px-2.5 font-sans font-semibold text-white truncate max-w-xs">
                            {row.nome}
                          </td>
                          <td className="py-2 px-2.5">{row.admissao || '-'}</td>
                          <td className="py-2 px-2.5 text-right text-emerald-400">
                            {row.valorHoraCarteira > 0 ? `R$ ${row.valorHoraCarteira.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-purple-400">
                            {row.valorHoraPorFora > 0 ? `R$ ${row.valorHoraPorFora.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-center">{row.qntMes}</td>
                          <td className="py-2 px-2.5 text-right">
                            {row.total1aParcela > 0 ? `R$ ${row.total1aParcela.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            {row.total2aParcela > 0 ? `R$ ${row.total2aParcela.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-2.5 text-center font-sans">
                            {row.isValid ? (
                              <span className="text-[10px] text-emerald-400 font-bold flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Válido
                              </span>
                            ) : (
                              <span
                                className="text-[10px] text-rose-400 font-bold flex items-center justify-center gap-1"
                                title={row.validationErrors.join(' | ')}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Inconsistência
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Opção de Ação */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-white block">Ação ao Confirmar:</span>
              <span className="text-[11px] text-slate-400">
                Escolha como gravar os registros no banco de dados
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <label
                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition flex items-center gap-1.5 ${
                  actionOption === 'update_existing'
                    ? 'bg-blue-600 text-white font-bold border-blue-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="actionOption"
                  checked={actionOption === 'update_existing'}
                  onChange={() => setActionOption('update_existing')}
                  className="hidden"
                />
                Atualizar Colaboradores por Nome
              </label>

              <label
                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition flex items-center gap-1.5 ${
                  actionOption === 'create_only'
                    ? 'bg-blue-600 text-white font-bold border-blue-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="actionOption"
                  checked={actionOption === 'create_only'}
                  onChange={() => setActionOption('create_only')}
                  className="hidden"
                />
                Criar Apenas Novos
              </label>

              <label
                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition flex items-center gap-1.5 ${
                  actionOption === 'preview_only'
                    ? 'bg-blue-600 text-white font-bold border-blue-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <input
                  type="radio"
                  name="actionOption"
                  checked={actionOption === 'preview_only'}
                  onChange={() => setActionOption('preview_only')}
                  className="hidden"
                />
                Apenas Apresentar / Simular
              </label>
            </div>
          </div>

          {/* Action Execution Footer */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              {actionOption === 'preview_only'
                ? 'Modo de simulação: os dados e gráficos estão disponíveis para apresentação visual.'
                : 'A importação gravará os colaboradores e cálculos na base da organização.'}
            </span>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setParsedData(null);
                  setFile(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={loading || parsedData.summary.valid === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Processando ({importProgress || 0}%)...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar e Importar ({parsedData.summary.valid} registros)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
