import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Layers,
  HelpCircle,
  Download,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Loader2,
  Database,
  Check,
  Truck,
  Utensils,
  Building,
} from 'lucide-react';
import {
  CommercialClient,
  CommercialMaterial,
  CommercialProposal,
  CommercialProposalItem,
  CommercialPolicy,
} from '../../types/commercial';
import {
  parseBomSpreadsheet,
  matchBomItemAgainstCatalog,
  calculateProposedPrice,
  roundToTwoDecimals,
  saveProposal,
  saveProposalItems,
  saveImportBatch,
  saveMaterial,
  callParseSupplierQuotePdfApi,
  downloadSampleExcelTemplate,
  downloadSampleSupplierQuotePdf,
  isImageFileType,
  filterMaterialsByMultiToken,
  STANDARD_INDUSTRIAL_CATALOG,
} from '../../services/commercialService';

interface CommercialProposalWizardProps {
  organizationId: string;
  clients: CommercialClient[];
  catalog: CommercialMaterial[];
  policy: CommercialPolicy | null;
  userId: string;
  userName: string;
  onSuccess: (proposalId: string) => void;
  onCancel: () => void;
}

export const CommercialProposalWizard: React.FC<CommercialProposalWizardProps> = ({
  organizationId,
  clients,
  catalog,
  policy,
  userId,
  userName,
  onSuccess,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Proposal General Info
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [newClientName, setNewClientName] = useState('');
  const [newClientCnpj, setNewClientCnpj] = useState('');
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
  const [validityDays, setValidityDays] = useState<number>(15);
  const [deliveryLocation, setDeliveryLocation] = useState('FOB - Unidade do Cliente');
  const [deliveryTimeframeDays, setDeliveryTimeframeDays] = useState<number>(20);
  const [paymentTerms, setPaymentTerms] = useState('28 dias DDL após faturamento');
  const [warrantyTerms, setWarrantyTerms] = useState('12 meses contra defeitos de fabricação');
  const [scopeDescription, setScopeDescription] = useState('');
  const [globalMarkup, setGlobalMarkup] = useState<number>(policy?.defaultMarkupPercent || 25);

  // Field Logistics & Assembly (Combo 3 em 1)
  const [includeFieldLogistics, setIncludeFieldLogistics] = useState(false);
  const [fieldMissionDays, setFieldMissionDays] = useState(5);
  const [fieldMissionTechs, setFieldMissionTechs] = useState(4);
  const [fieldTransportCost, setFieldTransportCost] = useState(480);
  const [fieldLodgingCost, setFieldLodgingCost] = useState(1680);
  const [fieldAllowancesCost, setFieldAllowancesCost] = useState(1900);
  const [fieldContingency, setFieldContingency] = useState(350);

  // Step 2: Items
  const [importMethod, setImportMethod] = useState<'upload' | 'manual'>('upload');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [items, setItems] = useState<
    Array<{
      code?: string;
      manufacturerCode?: string;
      brand?: string;
      description: string;
      specs?: string;
      unit: string;
      quantity: number;
      unitCost?: number;
      hasQuantityWarning?: boolean;
    }>
  >([]);
  const [uploadStats, setUploadStats] = useState<{
    totalRead: number;
    duplicateCount: number;
    incompleteCount: number;
  } | null>(null);

  // Manual Item Form
  const [manualCode, setManualCode] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualSpecs, setManualSpecs] = useState('');
  const [manualUnit, setManualUnit] = useState('UN');
  const [manualQty, setManualQty] = useState<number>(1);

  // Saving state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // AI Multimodal File Reader & Catalog Comparison States
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [analysisStatusText, setAnalysisStatusText] = useState('');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(true);
  const [extractedComparison, setExtractedComparison] = useState<
    Array<{
      id: string;
      originalDescription: string;
      quantity: number;
      unit: string;
      matchedCode?: string;
      matchedDescription?: string;
      catalogBaseCost: number;
      proposedUnitPrice: number;
      totalBaseCost: number;
      totalProposedPrice: number;
      isMatched: boolean;
    }> | null
  >(null);

  // Absorption into Catalog state
  const [isAbsorbingToCatalog, setIsAbsorbingToCatalog] = useState(false);
  const [absorbedSuccessCount, setAbsorbedSuccessCount] = useState<number | null>(null);
  const [showManualSuggestions, setShowManualSuggestions] = useState(false);

  // Effective full catalog combining database catalog and benchmark standards
  const effectiveFullCatalog = (catalog && catalog.length > 0)
    ? [...catalog, ...STANDARD_INDUSTRIAL_CATALOG.filter((s) => !catalog.some((c) => c.internalCode.trim().toLowerCase() === s.internalCode.trim().toLowerCase()))]
    : STANDARD_INDUSTRIAL_CATALOG;

  // Absorb items identified in proposal comparison into the persistent catalog
  const handleAbsorbComparisonToCatalog = async () => {
    if (!extractedComparison || extractedComparison.length === 0) return;
    setIsAbsorbingToCatalog(true);
    let count = 0;
    try {
      for (const row of extractedComparison) {
        if (row.catalogBaseCost > 0 || row.originalDescription) {
          const matId = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const isFitting = ['uniao', 'união', 'curva', 'te', 'tê', 'niple', 'valvula', 'válvula', 'flange'].some((f) =>
            (row.originalDescription || '').toLowerCase().includes(f)
          );
          const newMat: CommercialMaterial = {
            id: matId,
            organizationId,
            internalCode: row.matchedCode && row.matchedCode !== '-' ? row.matchedCode : `MAT-${Date.now().toString().slice(-4)}`,
            originalDescription: row.matchedDescription || row.originalDescription,
            normalizedDescription: (row.matchedDescription || row.originalDescription).toUpperCase(),
            unit: row.unit || (isFitting ? 'UN' : 'M'),
            baseCost: row.catalogBaseCost > 0 ? row.catalogBaseCost : 0,
            currency: 'BRL',
            sourceType: 'cotacao_confirmada',
            validityDays: 30,
            quoteDate: new Date().toISOString().split('T')[0],
            category: isFitting ? 'Conexões' : 'Tubulações',
            technicalSpecs: {
              materialGrade: (row.originalDescription || '').includes('316') ? 'AISI 316L' : 'AISI 304',
            },
            createdAt: new Date().toISOString(),
          };
          await saveMaterial(newMat);
          count++;
        }
      }
      setAbsorbedSuccessCount(count);
    } catch (err: any) {
      console.error('Erro ao absorver insumos no catálogo:', err);
      setErrorMsg(`Erro ao salvar insumos no catálogo: ${err?.message || 'Falha inesperada.'}`);
    } finally {
      setIsAbsorbingToCatalog(false);
    }
  };

  // Generalized File Processor (Called from Step 1 Quick-Card or Step 2 Dropzone)
  const processFile = async (file: File, autoAdvanceToStep2: boolean = false) => {
    setUploadedFileName(file.name);
    setErrorMsg('');
    setAbsorbedSuccessCount(null);
    setIsAnalyzingFile(true);
    setAnalysisStatusText(`Lendo ${file.name} com IA Multimodal e comparando com catálogo de preços...`);

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = isImageFileType(file.name, file.type);
    const isDoc = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

    if (isPdf || isImage || isDoc) {
      try {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const base64 = evt.target?.result as string;
            let detectedMime = file.type;
            if (!detectedMime) {
              if (isImage) detectedMime = file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
              else if (isPdf) detectedMime = 'application/pdf';
              else if (isDoc) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }

            if (isImage) {
              setFilePreviewUrl(base64);
              setShowImagePreview(true);
            } else {
              setFilePreviewUrl(null);
            }

            setAnalysisStatusText('Identificando insumos, dimensões e consultando preços no Catálogo OrçaÁgil...');
            const extracted = await callParseSupplierQuotePdfApi(base64, file.name, detectedMime || 'application/pdf', effectiveFullCatalog);

            if (!extracted.items || extracted.items.length === 0) {
              setErrorMsg(`Nenhum item de material identificado no arquivo fornecido. Por favor, revise a imagem ou documento.`);
              setIsAnalyzingFile(false);
              return;
            }

            // Cross-match items against catalog with specific unit pricing
            const comparisonRows = extracted.items.map((r, idx) => {
              const rawCode = r.internalCode || r.matchedInternalCode;
              const codeToUse = (rawCode && rawCode.replace(/[^a-z0-9]/gi, '').length >= 3) ? rawCode : undefined;

              const matchRes = matchBomItemAgainstCatalog(
                codeToUse,
                r.manufacturerCode,
                r.brand,
                r.description,
                r.specs,
                r.unit || 'UN',
                effectiveFullCatalog,
                globalMarkup
              );

              const isFitting = ['uniao', 'união', 'curva', 'te', 'tê', 'niple', 'valvula', 'válvula', 'flange'].some(f => (r.description || '').toLowerCase().includes(f));
              const resolvedUnit = isFitting ? 'UN' : (r.unit || matchRes.matchedMaterial?.unit || 'UN').toUpperCase();

              const catalogCost = matchRes.baseCost > 0
                ? matchRes.baseCost
                : (r.unitPrice && r.unitPrice > 0 ? r.unitPrice : 0);

              const proposedUnit = catalogCost > 0
                ? calculateProposedPrice(
                    catalogCost,
                    globalMarkup,
                    matchRes.matchedMaterial?.freightCost || 0,
                    matchRes.matchedMaterial?.taxCost || 0
                  )
                : 0;

              const qty = r.quantity > 0 ? r.quantity : 1;

              return {
                id: `comp_${Date.now()}_${idx}`,
                originalDescription: r.description,
                quantity: qty,
                unit: resolvedUnit,
                matchedCode: matchRes.matchedMaterial?.internalCode || (codeToUse ? codeToUse : undefined),
                matchedDescription: matchRes.matchedMaterial?.originalDescription || matchRes.matchedMaterial?.normalizedDescription,
                catalogBaseCost: catalogCost,
                proposedUnitPrice: proposedUnit,
                totalBaseCost: roundToTwoDecimals(catalogCost * qty),
                totalProposedPrice: roundToTwoDecimals(proposedUnit * qty),
                isMatched: catalogCost > 0,
              };
            });

            setExtractedComparison(comparisonRows);

            // Populate proposal items list with catalog prices
            setItems(
              extracted.items.map((r) => {
                const rawCode = r.internalCode || r.matchedInternalCode;
                const codeToUse = (rawCode && rawCode.replace(/[^a-z0-9]/gi, '').length >= 3) ? rawCode : undefined;

                const match = matchBomItemAgainstCatalog(
                  codeToUse,
                  r.manufacturerCode,
                  r.brand,
                  r.description,
                  r.specs,
                  r.unit || 'UN',
                  effectiveFullCatalog,
                  globalMarkup
                );
                const cost = match.baseCost > 0 ? match.baseCost : (r.unitPrice && r.unitPrice > 0 ? r.unitPrice : undefined);
                const isFitting = ['uniao', 'união', 'curva', 'te', 'tê', 'niple', 'valvula', 'válvula', 'flange'].some(f => (r.description || '').toLowerCase().includes(f));
                const resolvedUnit = isFitting ? 'UN' : (r.unit || match.matchedMaterial?.unit || 'UN').toUpperCase();

                return {
                  code: match.matchedMaterial?.internalCode || (codeToUse ? codeToUse : undefined),
                  manufacturerCode: r.manufacturerCode,
                  brand: r.brand,
                  description: r.description,
                  specs: [r.materialGrade, r.dimension, r.scheduleClass, r.specs].filter(Boolean).join(' ') || undefined,
                  unit: resolvedUnit,
                  quantity: r.quantity > 0 ? r.quantity : 1,
                  unitCost: cost,
                  hasQuantityWarning: !r.quantity || r.quantity <= 0,
                };
              })
            );

            setUploadStats({
              totalRead: extracted.items.length,
              duplicateCount: 0,
              incompleteCount: comparisonRows.filter((i) => i.catalogBaseCost <= 0).length,
            });

            if (autoAdvanceToStep2) {
              setStep(2);
            }
          } catch (err: any) {
            setErrorMsg(`Erro ao processar ${isImage ? 'imagem' : 'PDF'}: ${err.message || 'Falha na leitura do arquivo.'}`);
          } finally {
            setIsAnalyzingFile(false);
          }
        };
        reader.onerror = () => {
          setErrorMsg(`Erro ao ler arquivo ${isImage ? 'de imagem' : 'PDF'}.`);
          setIsAnalyzingFile(false);
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        setErrorMsg(`Erro ao carregar arquivo: ${err.message || 'Falha inesperada.'}`);
        setIsAnalyzingFile(false);
      }
      return;
    }

    // Handle Spreadsheets (.xlsx, .csv)
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const result = parseBomSpreadsheet(buffer, file.name);

        if (result.rows.length === 0) {
          setErrorMsg('Nenhuma linha válida encontrada na planilha. Verifique o cabeçalho e formato.');
          setIsAnalyzingFile(false);
          return;
        }

        const comparisonRows = result.rows.map((r, idx) => {
          const matchRes = matchBomItemAgainstCatalog(
            r.code,
            r.manufacturerCode,
            r.brand,
            r.description,
            r.specs,
            r.unit || 'UN',
            effectiveFullCatalog,
            globalMarkup
          );

          const catalogCost = matchRes.baseCost > 0
            ? matchRes.baseCost
            : (r.unitCost && r.unitCost > 0 ? r.unitCost : 0);

          const proposedUnit = catalogCost > 0
            ? calculateProposedPrice(
                catalogCost,
                globalMarkup,
                matchRes.matchedMaterial?.freightCost || 0,
                matchRes.matchedMaterial?.taxCost || 0
              )
            : 0;

          const qty = r.quantity > 0 ? r.quantity : 1;

          return {
            id: `comp_sheet_${Date.now()}_${idx}`,
            originalDescription: r.description,
            quantity: qty,
            unit: (r.unit || 'UN').toUpperCase(),
            matchedCode: matchRes.matchedMaterial?.internalCode || r.code,
            matchedDescription: matchRes.matchedMaterial?.originalDescription || matchRes.matchedMaterial?.normalizedDescription,
            catalogBaseCost: catalogCost,
            proposedUnitPrice: proposedUnit,
            totalBaseCost: roundToTwoDecimals(catalogCost * qty),
            totalProposedPrice: roundToTwoDecimals(proposedUnit * qty),
            isMatched: catalogCost > 0,
          };
        });

        setExtractedComparison(comparisonRows);

        setItems(
          result.rows.map((r) => {
            const match = matchBomItemAgainstCatalog(
              r.code,
              r.manufacturerCode,
              r.brand,
              r.description,
              r.specs,
              r.unit || 'UN',
              effectiveFullCatalog,
              globalMarkup
            );
            const cost = match.baseCost > 0 ? match.baseCost : (r.unitCost && r.unitCost > 0 ? r.unitCost : undefined);

            return {
              code: r.code || match.matchedMaterial?.internalCode,
              manufacturerCode: r.manufacturerCode,
              brand: r.brand,
              description: r.description,
              specs: r.specs,
              unit: r.unit,
              quantity: r.quantity,
              unitCost: cost,
              hasQuantityWarning: r.hasQuantityWarning,
            };
          })
        );

        setUploadStats({
          totalRead: result.totalRead,
          duplicateCount: result.duplicateCount,
          incompleteCount: result.incompleteCount,
        });

        if (autoAdvanceToStep2) {
          setStep(2);
        }
      } catch (err: any) {
        setErrorMsg(`Erro ao processar planilha: ${err.message || 'Arquivo corrompido ou formato inválido.'}`);
      } finally {
        setIsAnalyzingFile(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle File Upload & Parsing (.xlsx, .csv, .pdf, .jpg, .png)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file, false);
  };

  const handleAddManualItem = () => {
    if (!manualDesc.trim()) {
      setErrorMsg('Informe a descrição do material.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        code: manualCode.trim() || undefined,
        description: manualDesc.trim(),
        specs: manualSpecs.trim() || undefined,
        unit: manualUnit.trim().toUpperCase() || 'UN',
        quantity: manualQty > 0 ? manualQty : 1,
      },
    ]);
    setManualCode('');
    setManualDesc('');
    setManualSpecs('');
    setManualQty(1);
    setErrorMsg('');
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: string, val: any) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i === index) {
          return { ...it, [field]: val };
        }
        return it;
      })
    );
  };

  // Final Submission
  const handleSubmitProposal = async () => {
    if (items.length === 0) {
      setErrorMsg('A proposta precisa de pelo menos 1 item na lista.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const selectedClient = clients.find((c) => c.id === selectedClientId);
      const clientName = selectedClient ? selectedClient.name : newClientName || 'Cliente Industrial';
      const clientCnpj = selectedClient ? selectedClient.cnpjCpf : newClientCnpj || '';

      const today = new Date().toISOString().split('T')[0];
      const validityDate = new Date(Date.now() + validityDays * 86400000).toISOString().split('T')[0];
      const proposalCode = `PROP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Match items against internal catalog
      const resolvedItems: CommercialProposalItem[] = items.map((raw, idx) => {
        const matchRes = matchBomItemAgainstCatalog(
          raw.code,
          raw.manufacturerCode,
          raw.brand,
          raw.description,
          raw.specs,
          raw.unit,
          catalog,
          globalMarkup
        );

        // Use catalog baseCost if available; otherwise use real unitCost from uploaded file
        const effectiveBaseCost = matchRes.baseCost > 0
          ? matchRes.baseCost
          : (raw.unitCost && raw.unitCost > 0 ? raw.unitCost : 0);

        const isUnpriced = effectiveBaseCost <= 0;
        const proposedUnit = isUnpriced
          ? 0
          : calculateProposedPrice(
              effectiveBaseCost,
              globalMarkup,
              matchRes.matchedMaterial?.freightCost || 0,
              matchRes.matchedMaterial?.taxCost || 0
            );

        return {
          id: `prop_item_${proposalCode}_${idx + 1}`,
          proposalId: '', // Set below
          organizationId,
          itemNumber: idx + 1,
          originalLineNumber: idx + 2,
          inputCode: raw.code,
          inputManufacturerCode: raw.manufacturerCode,
          inputBrand: raw.brand,
          inputDescription: raw.description,
          inputSpecs: raw.specs,
          inputUnit: raw.unit,
          inputQuantity: raw.quantity,
          matchClassification: matchRes.baseCost > 0 ? matchRes.classification : (effectiveBaseCost > 0 ? 'EXATO' : matchRes.classification),
          matchedMaterialId: matchRes.matchedMaterial?.id,
          matchedInternalCode: matchRes.matchedMaterial?.internalCode || raw.code,
          matchedManufacturerCode: matchRes.matchedMaterial?.manufacturerCode || raw.manufacturerCode,
          matchedDescription: matchRes.matchedMaterial?.normalizedDescription || raw.description,
          priceSourceType: matchRes.baseCost > 0 ? matchRes.priceSourceType : (effectiveBaseCost > 0 ? 'cotacao_confirmada' : undefined),
          priceSourceDate: matchRes.matchedMaterial?.quoteDate || today,
          priceSourceDocument: matchRes.matchedMaterial?.sourceDocumentRef || uploadedFileName,
          supplierName: matchRes.matchedMaterial?.supplierName || (effectiveBaseCost > 0 ? 'Documento Anexo' : undefined),
          isPriceExpired: matchRes.isPriceExpired,
          technicalDifferencesExplanation: matchRes.differences,
          baseCost: effectiveBaseCost,
          freightComponent: matchRes.matchedMaterial?.freightCost || 0,
          taxComponent: matchRes.matchedMaterial?.taxCost || 0,
          markupPercent: globalMarkup,
          proposedUnitPrice: proposedUnit,
          proposedTotalPrice: roundToTwoDecimals(proposedUnit * raw.quantity),
          isPending: isUnpriced,
          pendingReason: isUnpriced
            ? 'Item não precificado no arquivo ou catálogo interno. Pendente cotação formal.'
            : undefined,
          status: isUnpriced ? 'pendente_cotacao' : 'ok',
        };
      });

      // Include Field Logistics & Assembly Package (Combo 3 em 1) if selected
      if (includeFieldLogistics) {
        const logisticsCost = fieldTransportCost + fieldLodgingCost + fieldAllowancesCost + fieldContingency;
        const logisticsPrice = roundToTwoDecimals(logisticsCost * (1 + globalMarkup / 100));
        resolvedItems.push({
          id: `prop_item_${proposalCode}_logistics`,
          proposalId: '',
          organizationId,
          itemNumber: resolvedItems.length + 1,
          originalLineNumber: resolvedItems.length + 2,
          inputCode: 'SERV-LOG-01',
          inputDescription: `Serviço de Montagem Industrial & Logística de Campo (${fieldMissionTechs} técnicos, ${fieldMissionDays} dias úteis, Van, Hospedagem e Diárias)`,
          inputUnit: 'SERV',
          inputQuantity: 1,
          matchClassification: 'EXATO',
          baseCost: logisticsCost,
          freightComponent: 0,
          taxComponent: 0,
          markupPercent: globalMarkup,
          proposedUnitPrice: logisticsPrice,
          proposedTotalPrice: logisticsPrice,
          isPending: false,
          status: 'ok',
        });
      }

      // Calculate totals
      const pricedItems = resolvedItems.filter((i) => !i.isPending && i.baseCost > 0);
      const totalBaseCost = pricedItems.reduce((acc, i) => acc + i.baseCost * i.inputQuantity, 0);
      const proposedTotal = pricedItems.reduce((acc, i) => acc + i.proposedTotalPrice, 0);
      const totalFreight = pricedItems.reduce((acc, i) => acc + i.freightComponent * i.inputQuantity, 0);
      const grossMarginAmt = proposedTotal - totalBaseCost;
      const grossMarginPct = proposedTotal > 0 ? (grossMarginAmt / proposedTotal) * 100 : 0;
      const hasUnpriced = resolvedItems.some((i) => i.isPending);

      const newProposal: CommercialProposal = {
        id: '',
        organizationId,
        code: proposalCode,
        title: title.trim() || `Proposta Comercial - ${clientName}`,
        clientId: selectedClientId || 'novo',
        clientName,
        clientCnpjCpf: clientCnpj,
        clientContactPerson: selectedClient?.contactName,
        clientEmail: selectedClient?.contactEmail,
        clientPhone: selectedClient?.contactPhone,
        currency,
        issueDate: today,
        validityDate,
        deliveryLocation,
        deliveryTimeframeDays,
        paymentTerms,
        warrantyTerms,
        scopeDescription: scopeDescription.trim() || 'Fornecimento de materiais conforme lista técnica.',
        totalItemsCount: resolvedItems.length,
        pricedItemsCount: pricedItems.length,
        pendingItemsCount: resolvedItems.length - pricedItems.length,
        totalBaseCost: roundToTwoDecimals(totalBaseCost),
        globalMarkupPercent: globalMarkup,
        totalFreightCost: roundToTwoDecimals(totalFreight),
        totalTaxCost: 0,
        grossMarginAmount: roundToTwoDecimals(grossMarginAmt),
        grossMarginPercent: roundToTwoDecimals(grossMarginPct),
        proposedTotal: roundToTwoDecimals(proposedTotal),
        status: hasUnpriced ? 'parcial' : 'aguardando_revisao',
        isPartial: hasUnpriced,
        createdBy: userId,
        createdByName: userName,
        history: [
          {
            date: new Date().toISOString(),
            action: 'Criação da Proposta',
            userName,
            details: `Proposta gerada com ${resolvedItems.length} itens (${pricedItems.length} precificados, ${
              resolvedItems.length - pricedItems.length
            } pendentes).`,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const savedProposalId = await saveProposal(newProposal);
      await saveProposalItems(
        savedProposalId,
        resolvedItems.map((it) => ({ ...it, proposalId: savedProposalId }))
      );

      // Record batch import log if uploaded
      if (uploadedFileName) {
        await saveImportBatch({
          id: `batch_${Date.now()}`,
          organizationId,
          batchCode: `IMP-${Date.now().toString().slice(-6)}`,
          fileName: uploadedFileName,
          sourceType: 'BOM_PROPOSTA',
          importedBy: userId,
          importedByName: userName,
          createdAt: new Date().toISOString(),
          totalRowsRead: uploadStats?.totalRead || items.length,
          acceptedRows: items.length,
          duplicateRows: uploadStats?.duplicateCount || 0,
          incompleteRows: uploadStats?.incompleteCount || 0,
          rejectedRows: 0,
          status: 'processado',
          proposalId: savedProposalId,
        });
      }

      onSuccess(savedProposalId);
    } catch (err: any) {
      setErrorMsg(`Erro ao criar proposta: ${err.message || 'Falha no servidor'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 sm:p-7 shadow-2xl text-slate-100 max-w-5xl mx-auto">
      {/* Wizard Progress Stepper */}
      <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-800">
        <div>
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">OrçaÁgil • Comercial</span>
          <h2 className="text-xl font-bold text-white mt-0.5">Nova Proposta Comercial & Importação de BOM</h2>
        </div>

        <div className="flex items-center space-x-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center space-x-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition ${
                  step === s
                    ? 'bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/20'
                    : step > s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-6 sm:w-12 h-0.5 ${step > s ? 'bg-emerald-600' : 'bg-slate-800'}`} />}
            </div>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: DADOS GERAIS, CLIENTE E POLÍTICA DE MARKUP */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Título da Proposta / Projeto
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Fornecimento de Tubulações Inox - Nova Linha de Mosto"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Selecionar Cliente</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cnpjCpf || 'Sem CNPJ'})
                    </option>
                  ))}
                  <option value="novo">+ Cadastrar Novo Cliente para esta Proposta</option>
                </select>
              </div>

              {selectedClientId === 'novo' && (
                <div className="p-3 bg-slate-900/80 border border-slate-700 rounded-lg space-y-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Razão Social / Nome do Cliente</label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Ex: Ambev S/A"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">CNPJ / CPF</label>
                    <input
                      type="text"
                      value={newClientCnpj}
                      onChange={(e) => setNewClientCnpj(e.target.value)}
                      placeholder="Ex: 56.222.407/0001-95"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Moeda da Proposta</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="BRL">BRL (R$ Real)</option>
                    <option value="USD">USD ($ Dólar)</option>
                    <option value="EUR">EUR (€ Euro)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Validade da Proposta</label>
                  <select
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value={10}>10 dias corridos</option>
                    <option value={15}>15 dias corridos (Padrão)</option>
                    <option value={30}>30 dias corridos</option>
                    <option value={60}>60 dias corridos</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Local de Entrega / Frete</label>
                <input
                  type="text"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  placeholder="Ex: CIF Planta Paulínia / FOB Fábrica"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Prazo de Entrega (dias)</label>
                  <input
                    type="number"
                    value={deliveryTimeframeDays}
                    onChange={(e) => setDeliveryTimeframeDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Condição de Pagamento</label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Ex: 28 dias DDL"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Escopo Resumido</label>
                <textarea
                  value={scopeDescription}
                  onChange={(e) => setScopeDescription(e.target.value)}
                  rows={2}
                  placeholder="Descrição técnica resumida do escopo do fornecimento..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Authorized Markup Policy Card with Mandatory Test Rule */}
          <div className="p-4 bg-cyan-950/40 border border-cyan-800/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Markup Autorizado sobre o Custo-Base
                </h4>
              </div>
              <span className="text-[11px] text-cyan-400 font-mono">Cálculo determinístico oficial</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Percentual de Markup Autorizado: <strong className="text-cyan-300 font-mono">{globalMarkup}%</strong>
                </label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={globalMarkup}
                  onChange={(e) => setGlobalMarkup(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>Mín: 10%</span>
                  <span>Padrão: 25%</span>
                  <span>Máx: 60%</span>
                </div>
              </div>

              {/* Mandatory Test Validation Card: Custo R$ 100,00 + 25% = R$ 125,00 */}
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                  Exemplo de Memória de Cálculo:
                </span>
                <p className="text-slate-300 font-mono">
                  Custo R$ 100,00 × (1 + {globalMarkup}%) ={' '}
                  <strong className="text-cyan-300 font-bold">
                    R$ {(100 * (1 + globalMarkup / 100)).toFixed(2).replace('.', ',')}
                  </strong>
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  * Markup incide diretamente sobre o custo-base, sem distorção com margem sobre vendas.
                </p>
              </div>
            </div>
          </div>

          {/* Quick-Start: Preenchimento Automático por Imagem / Arquivo com IA */}
          <div className="p-4 bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 border border-cyan-500/40 rounded-xl space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Preencher Proposta por Foto, Documento ou Planilha (IA Multimodal)
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Envie a anotação do cliente (foto JPG, PNG, PDF ou Excel). A IA extrai todos os materiais e compara com os preços vigentes no catálogo da empresa.
                  </p>
                </div>
              </div>

              <label className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg cursor-pointer transition shadow-md flex items-center space-x-2 flex-shrink-0">
                <Upload className="w-4 h-4" />
                <span>Carregar Foto / Arquivo</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processFile(f, true);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep(2)}
              className="flex items-center space-x-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition"
            >
              <span>Avançar para Lista de Materiais (BOM)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: INCLUSÃO DA LISTA DE MATERIAIS (BOM EXCEL/CSV OU MANUAL) */}
      {step === 2 && (
        <div className="space-y-6">
          {/* AI Multimodal Loading State */}
          {isAnalyzingFile && (
            <div className="p-6 bg-slate-900/90 border border-cyan-500/50 rounded-xl text-center space-y-3 animate-pulse shadow-xl">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <h4 className="text-sm font-bold text-white">Processando Arquivo com Inteligência Artificial</h4>
              <p className="text-xs text-cyan-300 font-medium">{analysisStatusText || 'Lendo itens da imagem e comparando com catálogo de preços...'}</p>
              <p className="text-[11px] text-slate-400">Cruzando códigos, ligas (304/316) e dimensões nominais...</p>
            </div>
          )}

          {/* Comparativo de Preços Extraídos x Catálogo da Empresa */}
          {extractedComparison && extractedComparison.length > 0 && (
            <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                        Inteligência de Preços OrçaÁgil
                      </span>
                      <span className="text-[11px] text-slate-400">Arquivo: {uploadedFileName}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-0.5">
                      Comparativo de Insumos Extraídos x Catálogo de Preços
                    </h3>
                  </div>
                </div>

                {filePreviewUrl && (
                  <button
                    onClick={() => setShowImagePreview(!showImagePreview)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs border border-slate-700 transition"
                  >
                    {showImagePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showImagePreview ? 'Ocultar Foto / Scan' : 'Ver Foto / Scan Original'}</span>
                  </button>
                )}
              </div>

              {/* Optional Image View */}
              {filePreviewUrl && showImagePreview && (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-slate-400 font-semibold mb-2 self-start flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                    Foto / Anotação da Lista Enviada ({uploadedFileName}):
                  </span>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-800/80 shadow-md">
                    <img
                      src={filePreviewUrl}
                      alt="Anotação de Materiais"
                      className="max-w-full h-auto object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Comparison KPI Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Itens Identificados</span>
                  <strong className="text-white font-mono text-base">{extractedComparison.length} itens</strong>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-emerald-900/40">
                  <span className="text-emerald-400 block text-[11px]">Com Preço no Catálogo</span>
                  <strong className="text-emerald-300 font-mono text-base">
                    {extractedComparison.filter((i) => i.isMatched).length} de {extractedComparison.length}
                  </strong>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px]">Custo Base Estimado</span>
                  <strong className="text-cyan-300 font-mono text-base">
                    R$ {extractedComparison.reduce((acc, i) => acc + i.totalBaseCost, 0).toFixed(2).replace('.', ',')}
                  </strong>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-cyan-800/50">
                  <span className="text-cyan-300 block text-[11px]">Preço Total com Markup ({globalMarkup}%)</span>
                  <strong className="text-white font-mono text-base">
                    R$ {extractedComparison.reduce((acc, i) => acc + i.totalProposedPrice, 0).toFixed(2).replace('.', ',')}
                  </strong>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Material Lido da Imagem / Anotação</th>
                      <th className="py-2.5 px-3">Item Correspondente no Catálogo</th>
                      <th className="py-2.5 px-3 text-center w-16">Qtd</th>
                      <th className="py-2.5 px-3 text-right w-24">Custo Catálogo</th>
                      <th className="py-2.5 px-3 text-right w-28">Preço Proposto</th>
                      <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                      <th className="py-2.5 px-3 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {extractedComparison.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-center text-slate-500 font-sans">{idx + 1}</td>
                        <td className="py-2 px-3 font-sans text-white font-medium">
                          {row.originalDescription}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          {row.matchedCode ? (
                            <div>
                              <span className="text-cyan-400 font-mono font-semibold block">{row.matchedCode}</span>
                              <span className="text-slate-400 text-[11px] block truncate max-w-xs">{row.matchedDescription}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Não encontrado no catálogo</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-300 font-bold">
                          {row.quantity} {row.unit}
                        </td>
                        <td className="py-2 px-3 text-right font-bold">
                          {row.catalogBaseCost > 0 ? (
                            <span className="text-emerald-400">R$ {row.catalogBaseCost.toFixed(2).replace('.', ',')}</span>
                          ) : (
                            <span className="text-slate-500 italic">R$ 0,00</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-200">
                          {row.proposedUnitPrice > 0 ? (
                            `R$ ${row.proposedUnitPrice.toFixed(2).replace('.', ',')}`
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-cyan-300">
                          {row.totalProposedPrice > 0 ? (
                            `R$ ${row.totalProposedPrice.toFixed(2).replace('.', ',')}`
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.isMatched ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Preço Catálogo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Novo Insumo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions on Extracted Comparison */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex items-center space-x-2 text-xs">
                  {absorbedSuccessCount !== null ? (
                    <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                      <Check className="w-4 h-4" />
                      <span>{absorbedSuccessCount} insumos absorvidos e cadastrados no catálogo com sucesso!</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">
                      Preços identificados e comparados com o catálogo. Os itens já foram carregados na lista da proposta abaixo.
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleAbsorbComparisonToCatalog}
                    disabled={isAbsorbingToCatalog}
                    className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs transition shadow-md disabled:opacity-50"
                  >
                    {isAbsorbingToCatalog ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Database className="w-3.5 h-3.5" />
                    )}
                    <span>Absorver Preços e Novos Insumos no Catálogo</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex space-x-2">
              <button
                onClick={() => setImportMethod('upload')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  importMethod === 'upload'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Importar Arquivo / Imagem (IA)</span>
              </button>
              <button
                onClick={() => setImportMethod('manual')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  importMethod === 'manual'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Itens Manualmente</span>
              </button>
            </div>

            <span className="text-xs text-slate-400 font-medium">
              Total de itens na lista: <strong className="text-cyan-300 font-mono">{items.length}</strong>
            </span>
          </div>

          {/* Import Method: Upload File */}
          {importMethod === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-6 text-center transition bg-slate-900/40">
                <Upload className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-white">Selecione ou arraste sua lista de materiais (.xlsx, .csv, .pdf ou imagem .jpg, .png)</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Detecção automática com IA: lê imagens de blocos de notas, fotos de requisições, PDFs e planilhas, extraindo quantidades, insumos e buscando preços vigentes.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <label className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium text-xs rounded-lg cursor-pointer transition border border-cyan-500/30">
                    Procurar Arquivo (Foto, PDF, Word, Planilha)
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
                  <span>Modelos de arquivo para download:</span>
                  <button
                    type="button"
                    onClick={downloadSampleExcelTemplate}
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Download className="w-3 h-3" /> Modelo Planilha (.xlsx)
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={downloadSampleSupplierQuotePdf}
                    className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Download className="w-3 h-3" /> Modelo Cotação (.pdf)
                  </button>
                </div>
              </div>

              {uploadStats && (
                <div className="grid grid-cols-3 gap-3 text-xs bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">Linhas Lidas</span>
                    <strong className="text-white font-mono">{uploadStats.totalRead}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Duplicidades Consolidadas</span>
                    <strong className="text-cyan-300 font-mono">{uploadStats.duplicateCount}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Linhas Rejeitadas/Vazias</span>
                    <strong className="text-amber-400 font-mono">{uploadStats.incompleteCount}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import Method: Manual Item Entry */}
          {importMethod === 'manual' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Adicionar Item Manual</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Código (Opcional)</label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Ex: TB-INX-304-2"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2 relative">
                  <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span>Descrição do Material *</span>
                    <span className="text-[10px] text-cyan-400 font-mono">Busca inteligente (ex: "tee 304", "uniao 2")</span>
                  </label>
                  <input
                    type="text"
                    value={manualDesc}
                    onChange={(e) => {
                      setManualDesc(e.target.value);
                      setShowManualSuggestions(true);
                    }}
                    onFocus={() => setShowManualSuggestions(true)}
                    placeholder="Digite para buscar no catálogo (ex: tee 304, curva 90, uniao...)"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 outline-none"
                  />
                  {showManualSuggestions && manualDesc.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-cyan-500/50 rounded-lg shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-800">
                      {filterMaterialsByMultiToken(effectiveFullCatalog, manualDesc).slice(0, 8).map((catItem) => (
                        <button
                          key={catItem.id || catItem.internalCode}
                          type="button"
                          onClick={() => {
                            setManualCode(catItem.internalCode);
                            setManualDesc(catItem.originalDescription);
                            setManualSpecs(
                              `${catItem.technicalSpecs?.materialGrade || ''} ${catItem.technicalSpecs?.dimension || ''}`.trim()
                            );
                            setManualUnit(catItem.unit || 'UN');
                            setShowManualSuggestions(false);
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-800/90 transition flex items-center justify-between group"
                        >
                          <div>
                            <span className="text-cyan-400 font-mono text-[11px] font-semibold block">
                              {catItem.internalCode}
                            </span>
                            <span className="text-white text-xs block font-medium group-hover:text-cyan-200">
                              {catItem.originalDescription}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {catItem.category} • {catItem.unit}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <span className="text-emerald-400 font-mono font-bold text-xs block">
                              R$ {catItem.baseCost.toFixed(2).replace('.', ',')}
                            </span>
                            <span className="text-[10px] text-slate-500">Custo Base</span>
                          </div>
                        </button>
                      ))}
                      {filterMaterialsByMultiToken(effectiveFullCatalog, manualDesc).length === 0 && (
                        <div className="p-3 text-center text-slate-500 text-xs italic">
                          Nenhum insumo encontrado no catálogo com os termos informados.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Norma / Dimensão</label>
                  <input
                    type="text"
                    value={manualSpecs}
                    onChange={(e) => setManualSpecs(e.target.value)}
                    placeholder="Ex: ASTM A312 DN50"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Unidade</label>
                  <input
                    type="text"
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={manualQty}
                    onChange={(e) => setManualQty(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <button
                    onClick={handleAddManualItem}
                    className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded transition flex items-center justify-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Inserir Item</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Editable Items Preview Table */}
          {items.length > 0 && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Pré-Visualização e Ajustes da BOM ({items.length} itens)
                </span>
                <span className="text-[11px] text-slate-400">Você pode ajustar quantidades e unidades antes de processar</span>
              </div>

              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-center w-10">#</th>
                      <th className="py-2 px-3 w-32">Código</th>
                      <th className="py-2 px-3">Descrição do Material</th>
                      <th className="py-2 px-3 w-20 text-center">Unid</th>
                      <th className="py-2 px-3 w-24 text-right">Qtd</th>
                      <th className="py-2 px-3 text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 text-center text-slate-500 font-sans">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={it.code || ''}
                            onChange={(e) => handleUpdateItem(idx, 'code', e.target.value)}
                            placeholder="S/ Cód"
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-cyan-300 text-xs px-1 py-0.5 outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-slate-200 text-xs px-1 py-0.5 outline-none"
                          />
                          {it.hasQuantityWarning && (
                            <span className="text-[10px] text-amber-400 block font-sans">
                              * Quantidade não informada; definida automaticamente como 1.
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="text"
                            value={it.unit}
                            onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value.toUpperCase())}
                            className="w-12 text-center bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-slate-300 text-xs outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => handleUpdateItem(idx, 'quantity', Number(e.target.value))}
                            className="w-16 text-right bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-white font-bold text-xs outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                            title="Remover item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep(1)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={items.length === 0}
              className="flex items-center space-x-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
            >
              <span>Avançar para Revisão e Confirmação</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: RESUMO PRELIMINAR E CONFIRMAÇÃO DE CRIAÇÃO */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
              Resumo da Proposta Comercial
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Cliente</span>
                <strong className="text-white">
                  {clients.find((c) => c.id === selectedClientId)?.name || newClientName || 'Cliente Industrial'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Moeda & Validade</span>
                <strong className="text-cyan-300 font-mono">
                  {currency} • {validityDays} dias
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Markup Geral</span>
                <strong className="text-cyan-300 font-mono">{globalMarkup}% sobre custo</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Total de Itens</span>
                <strong className="text-emerald-400 font-mono">{items.length} itens</strong>
              </div>
            </div>
          </div>

          {/* Optional: Field Logistics & Assembly Package (Combo 3 em 1) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-white">Logística & Equipe de Montagem em Campo (Combo 3 em 1)</h4>
                  <span className="text-[11px] text-slate-400">
                    Inclua transporte de equipe, hospedagem corporativa e diárias CLT diretamente nesta proposta
                  </span>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFieldLogistics}
                  onChange={(e) => setIncludeFieldLogistics(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {includeFieldLogistics && (
              <div className="space-y-4 pt-1 animate-in fade-in-50 duration-200 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px]">Duração da Obra (Dias)</label>
                    <input
                      type="number"
                      value={fieldMissionDays}
                      onChange={(e) => setFieldMissionDays(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px]">Tamanho da Equipe</label>
                    <input
                      type="number"
                      value={fieldMissionTechs}
                      onChange={(e) => setFieldMissionTechs(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px]">Transporte / Van (R$)</label>
                    <input
                      type="number"
                      value={fieldTransportCost}
                      onChange={(e) => setFieldTransportCost(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px]">Hospedagem Twin (R$)</label>
                    <input
                      type="number"
                      value={fieldLodgingCost}
                      onChange={(e) => setFieldLodgingCost(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Custo Logística: <strong className="text-slate-200 font-mono">R$ {(fieldTransportCost + fieldLodgingCost + fieldAllowancesCost + fieldContingency).toFixed(2)}</strong> + Markup {globalMarkup}%
                  </span>
                  <span className="text-emerald-400 font-bold font-mono">
                    Total Serviço Montagem: R$ {((fieldTransportCost + fieldLodgingCost + fieldAllowancesCost + fieldContingency) * (1 + globalMarkup / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-cyan-950/30 border border-cyan-800/40 rounded-xl text-xs space-y-2 text-cyan-200">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <strong className="text-cyan-300">Pronto para processar a busca no catálogo interno</strong>
            </div>
            <p>
              Ao confirmar, cada um dos {items.length} itens será cruzado contra o catálogo e histórico de compras da sua
              organização na ordem estrita: código interno, código do fabricante, cotações confirmadas, compras históricas e
              itens comparáveis.
            </p>
            <p className="text-[11px] text-cyan-400/80">
              Itens não localizados permanecerão destacados com pendência e nunca receberão custo zero silencioso.
            </p>
          </div>

          <div className="flex justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep(2)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Itens</span>
            </button>
            <div className="flex space-x-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitProposal}
                disabled={isSubmitting}
                className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition shadow-lg disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Processando e Cruzando Dados...' : 'Confirmar e Criar Proposta'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
