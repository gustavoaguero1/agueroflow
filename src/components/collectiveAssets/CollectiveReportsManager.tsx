import React, { useState } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetWorker,
  CollectiveAssetMovement,
  CollectiveAssetService,
  CollectiveAssetCalculations,
} from '../../types/collectiveAssets';
import {
  createCollectiveAsset,
} from '../../services/collectiveAssetsService';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';

interface CollectiveReportsManagerProps {
  organizationId: string;
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  workers: CollectiveAssetWorker[];
  movements: CollectiveAssetMovement[];
  services: CollectiveAssetService[];
  calculatedAssetsMap: Map<string, CollectiveAssetCalculations>;
  canManage: boolean;
  onRefresh?: () => void;
}

export const CollectiveReportsManager: React.FC<CollectiveReportsManagerProps> = ({
  organizationId,
  assets,
  categories,
  workers,
  movements,
  services,
  calculatedAssetsMap,
  canManage,
  onRefresh,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'export' | 'import' | 'demo'>('export');

  // CSV Import State
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  // Demo seeder state
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [demoMessage, setDemoMessage] = useState('');

  // CSV Export functions
  const handleExportAssetsCSV = () => {
    const headers = [
      'Código',
      'Descrição',
      'Categoria',
      'Marca/Modelo',
      'Patrimônio/Série',
      'Local de Guarda',
      'Condição',
      'Situação Atual',
      'Com Quem Está',
      'Próxima Manutenção',
      'Próxima Calibração',
      'Próximo Vencimento',
      'Dias Restantes',
      'Alerta',
    ];

    const rows = assets.map((asset) => {
      const calc = calculatedAssetsMap.get(asset.id);
      return [
        `"${asset.code}"`,
        `"${asset.description}"`,
        `"${asset.categoryName}"`,
        `"${asset.brandModel || ''}"`,
        `"${asset.serialNumber || ''}"`,
        `"${asset.storageLocation || ''}"`,
        `"${asset.condition}"`,
        `"${calc?.situation || calc?.currentSituation || ''}"`,
        `"${calc?.currentCheckout?.workerName || calc?.currentHolderName || ''}"`,
        `"${calc?.nextMaintenanceDate || ''}"`,
        `"${calc?.nextCalibrationDate || ''}"`,
        `"${calc?.nextDueDate || calc?.nextExpirationDate || ''}"`,
        calc?.daysRemaining != null ? calc.daysRemaining : '',
        `"${calc?.alert || calc?.alertLevel || 'EM_DIA'}"`,
      ].join(';');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bens_coletivos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMovementsCSV = () => {
    const headers = [
      'Código do Bem',
      'Descrição do Bem',
      'Colaborador',
      'Matrícula',
      'Data/Hora Retirada',
      'Liberado Por',
      'Data/Hora Devolução',
      'Recebido Por',
      'Condição Devolução',
      'Status',
      'Observações',
    ];

    const rows = movements.map((m) => [
      `"${m.assetCode}"`,
      `"${m.assetDescription}"`,
      `"${m.workerName}"`,
      `"${m.workerRegistration}"`,
      `"${m.checkoutDate}"`,
      `"${m.releasedBy}"`,
      `"${m.returnDate || ''}"`,
      `"${m.receivedBy || ''}"`,
      `"${m.returnCondition || ''}"`,
      `"${m.status}"`,
      `"${m.checkoutNotes || m.returnNotes || ''}"`,
    ].join(';'));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `movimentacoes_bens_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportServicesCSV = () => {
    const headers = [
      'Data Realização',
      'Código do Bem',
      'Descrição',
      'Tipo Serviço',
      'Executante',
      'Certificado / OS',
      'Resultado',
      'Observações',
    ];

    const rows = services.map((s) => [
      `"${s.serviceDate}"`,
      `"${s.assetCode}"`,
      `"${s.assetDescription || s.assetCode}"`,
      `"${s.type || s.serviceType || ''}"`,
      `"${s.performer || s.performedBy || ''}"`,
      `"${s.certificateOrOsNumber || s.certificateOrOrderNumber || ''}"`,
      `"${s.result}"`,
      `"${s.notes || ''}"`,
    ].join(';'));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laudos_manutencoes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Parsing Preview
  const handleParseCSV = () => {
    setImportErrors([]);
    setImportPreview([]);
    setImportSuccessCount(null);

    if (!importText.trim()) {
      setImportErrors(['Cole o texto CSV ou selecione um arquivo válido.']);
      return;
    }

    const lines = importText.trim().split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      setImportErrors(['O arquivo deve conter cabeçalho e pelo menos 1 linha de dados.']);
      return;
    }

    const existingCodes = new Set(assets.map((a) => a.code.toLowerCase().trim()));
    const parsedItems: any[] = [];
    const errors: string[] = [];

    // Header line detection delimiter (, or ;)
    const delimiter = lines[0].includes(';') ? ';' : ',';

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.replace(/^"|"$/g, '').trim());
      if (parts.length < 2) continue;

      const code = parts[0];
      const desc = parts[1];
      const catName = parts[2] || 'Ferramentas Gerais';
      const brand = parts[3] || '';
      const serial = parts[4] || '';
      const location = parts[5] || 'Almoxarifado Central';

      if (!code || !desc) {
        errors.push(`Linha ${i + 1}: Código e Descrição são obrigatórios.`);
        continue;
      }

      if (existingCodes.has(code.toLowerCase())) {
        errors.push(`Linha ${i + 1}: O código "${code}" já existe na organização (duplicata).`);
        continue;
      }

      // Check category match or fallback
      let category = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      if (!category && categories.length > 0) {
        category = categories[0];
      }

      parsedItems.push({
        code,
        description: desc,
        categoryName: category ? category.name : catName,
        categoryId: category ? category.id : 'default',
        brandModel: brand,
        serialNumber: serial,
        storageLocation: location,
      });
    }

    setImportErrors(errors);
    setImportPreview(parsedItems);
  };

  const handleExecuteImport = async () => {
    if (importPreview.length === 0) return;
    try {
      setIsImporting(true);
      let successCount = 0;

      for (const item of importPreview) {
        await createCollectiveAsset({
          organizationId,
          code: item.code,
          description: item.description,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          brandModel: item.brandModel,
          serialNumber: item.serialNumber,
          storageLocation: item.storageLocation,
          condition: 'active',
          isDemo: false,
        });
        successCount++;
      }

      setImportSuccessCount(successCount);
      setImportPreview([]);
      setImportText('');
      onRefresh?.();
    } catch (err: unknown) {
      console.error('Erro na importação em lote:', err);
      setImportErrors([err instanceof Error ? err.message : 'Falha ao importar registros.']);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Relatórios e Importação de Planilhas
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Exportação de dados operacionais para auditoria, importador de inventário com validação de duplicidade e gerador de dados de demonstração.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0b101b] p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveReportTab('export')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeReportTab === 'export'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5 inline mr-1" />
            Exportar CSV
          </button>
          <button
            onClick={() => setActiveReportTab('import')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeReportTab === 'import'
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5 inline mr-1" />
            Importar Planilha
          </button>
          <button
            onClick={() => setActiveReportTab('demo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeReportTab === 'demo'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 inline mr-1" />
            Dados Demo
          </button>
        </div>
      </div>

      {/* TAB: EXPORT */}
      {activeReportTab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl w-fit mb-3">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Inventário de Bens Coletivos</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Exporta a relação completa de bens cadastrados com categoria, status de manutenção/calibração calculados, responsável atual e data do próximo vencimento.
              </p>
            </div>
            <button
              onClick={handleExportAssetsCSV}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-400 text-white transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar Bens ({assets.length})
            </button>
          </div>

          <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl w-fit mb-3">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Histórico de Movimentações</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Relação detalhada de saídas e devoluções, colaboradores responsáveis, datas de empréstimo, prazos de devolução e avarias comunicadas.
              </p>
            </div>
            <button
              onClick={handleExportMovementsCSV}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar Movimentações ({movements.length})
            </button>
          </div>

          <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl w-fit mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Laudos de Calibração e OS</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Registro histórico de manutenções preventivas, corretivas e calibrações com empresas executoras, números de laudo e resultados de conformidade.
              </p>
            </div>
            <button
              onClick={handleExportServicesCSV}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar Serviços ({services.length})
            </button>
          </div>
        </div>
      )}

      {/* TAB: IMPORT */}
      {activeReportTab === 'import' && (
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              Importar Inventário via Planilha CSV
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Cole o conteúdo CSV no formato abaixo ou use ponto e vírgula como separador. Códigos já cadastrados serão rejeitados para evitar duplicidade.
            </p>
          </div>

          <div className="bg-[#0b101b] p-3 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
            <div className="text-slate-300 font-bold">Estrutura esperada do CSV:</div>
            <div>Código;Descrição;Categoria;Marca_Modelo;Número_Série;Local_Guarda</div>
            <div className="text-slate-500">Ex: BC-001;Martelete Perfurador 800W;Ferramentas Elétricas;Bosch GBH 2-24;SN-88912;Prateleira A1</div>
          </div>

          <div>
            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Cole os dados da planilha aqui..."
              className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs font-mono rounded-xl p-3 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleParseCSV}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white transition"
            >
              Pré-visualizar e Validar
            </button>
          </div>

          {/* Validation Errors */}
          {importErrors.length > 0 && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1">
              <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Inconsistências encontradas ({importErrors.length}):
              </div>
              {importErrors.map((err, idx) => (
                <div key={idx} className="text-xs text-rose-300 pl-5">
                  • {err}
                </div>
              ))}
            </div>
          )}

          {/* Success Notification */}
          {importSuccessCount !== null && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {importSuccessCount} bens coletivos importados com sucesso!
            </div>
          )}

          {/* Preview Table */}
          {importPreview.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200">
                  Pré-visualização: {importPreview.length} bens válidos prontos para importação
                </h4>
                <button
                  onClick={handleExecuteImport}
                  disabled={isImporting || !canManage}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isImporting ? 'Gravando no Firestore...' : 'Confirmar e Salvar Bens'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0b101b] text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="py-2 px-3">Código</th>
                      <th className="py-2 px-3">Descrição</th>
                      <th className="py-2 px-3">Categoria</th>
                      <th className="py-2 px-3">Marca/Modelo</th>
                      <th className="py-2 px-3">Local</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {importPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-amber-400 font-bold">{item.code}</td>
                        <td className="py-2 px-3">{item.description}</td>
                        <td className="py-2 px-3 text-slate-400">{item.categoryName}</td>
                        <td className="py-2 px-3 text-slate-400">{item.brandModel || '-'}</td>
                        <td className="py-2 px-3 text-slate-400">{item.storageLocation || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: DEMO DATA */}
      {activeReportTab === 'demo' && (
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Carregar Dados de Demonstração</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Conforme as diretrizes, nenhum dado fictício deve ser misturado com dados reais de clientes sem identificação. Ao clicar abaixo, o sistema injetará 5 categorias padrão, 7 bens com diferentes cenários (em dia, a vencer, vencido, sem data registrada e em manutenção), 4 colaboradores e históricos de movimentação marcados expressamente com o rótulo &ldquo;Dados de demonstração&rdquo;.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
