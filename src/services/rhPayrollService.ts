import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { FieldWorker } from '../types';
import {
  RhEmployee,
  RhThirteenthCalculation,
  RhCalculationBatch,
  RhImportBatch,
  RhPayrollPolicy,
  RhSpreadsheetRowData,
  RhDivergence,
} from '../types/rhPayroll';

import { calculateProgressiveInss } from './inss';
import { directoryChanges, toDirectoryEntry } from './rhDirectory';
import { PAY_COLLECTION } from './fieldWorkerPay';
import { saveFieldWorker } from './fieldWorkerPayStore';
export * from './inss';

/**
 * Cálculo oficial dos Avos de 13º Salário (0 a 12 meses).
 * Regra CLT: A fração igual ou superior a 15 dias de trabalho dentro do mês
 * confere ao empregado o direito a 1/12 (um avo).
 */
export function calculateThirteenthAvos(
  admissionDateStr: string,
  referenceYear = 2025,
  dismissalDateStr?: string | null
): number {
  if (!admissionDateStr) return 12;

  const admissionDate = new Date(admissionDateStr + 'T00:00:00');
  const admYear = admissionDate.getFullYear();
  const admMonth = admissionDate.getMonth(); // 0-11
  const admDay = admissionDate.getDate();

  // Se admitido em ano posterior ao ano de referência
  if (admYear > referenceYear) {
    return 0;
  }

  let cutOffMonth = 11; // Dezembro (0-11)
  let cutOffDay = 31;

  if (dismissalDateStr) {
    const disDate = new Date(dismissalDateStr + 'T00:00:00');
    if (disDate.getFullYear() === referenceYear) {
      cutOffMonth = disDate.getMonth();
      cutOffDay = disDate.getDate();
    } else if (disDate.getFullYear() < referenceYear) {
      return 0; // Já desligado antes do ano
    }
  }

  // Admitido em anos anteriores: conta de Janeiro (0) até cutOffMonth
  if (admYear < referenceYear) {
    let avos = cutOffMonth + 1;
    if (dismissalDateStr && cutOffDay < 15) {
      avos -= 1; // Último mês trabalhou menos de 15 dias
    }
    return Math.max(0, Math.min(12, avos));
  }

  // Admitido no próprio ano de referência
  let avos = 0;
  for (let m = admMonth; m <= cutOffMonth; m++) {
    if (m === admMonth) {
      // No mês de admissão: confere se trabalhou 15 dias ou mais
      const daysInMonth = new Date(referenceYear, m + 1, 0).getDate();
      const workedDays = daysInMonth - admDay + 1;
      if (workedDays >= 15) {
        avos += 1;
      }
    } else if (m === cutOffMonth && dismissalDateStr) {
      // No mês de demissão
      if (cutOffDay >= 15) {
        avos += 1;
      }
    } else {
      // Meses intermediários completos
      avos += 1;
    }
  }

  return Math.max(0, Math.min(12, avos));
}

/**
 * Arredondamento monetário preciso para 2 casas decimais.
 */
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Executa o cálculo rigoroso e auditável de 13º Salário para um colaborador.
 * Distingue formalmente:
 * - Carteira (CLT Oficial)
 * - Verba Complementar ("Por Fora", com trava e exigência de autorização expressa)
 */
export function calculateEmployeeThirteenth({
  employee,
  referenceYear = 2025,
  monthlyHours = 220,
  importedRef,
  porForaConfirmed = true,
  runId = `run_${Date.now()}`,
}: {
  employee: RhEmployee;
  referenceYear?: number;
  monthlyHours?: number;
  importedRef?: RhThirteenthCalculation['importedReference'];
  porForaConfirmed?: boolean;
  runId?: string;
}): RhThirteenthCalculation {
  const avos = calculateThirteenthAvos(
    employee.admissionDate,
    referenceYear,
    employee.dismissalDate
  );

  // Bases mensais (Valor Hora * 220h configurável)
  const baseSalaryCarteira = roundCurrency(employee.hourlyRateCarteira * monthlyHours);
  const baseSalaryPorFora = roundCurrency(employee.hourlyRatePorFora * monthlyHours);
  const baseSalaryTotal = roundCurrency(baseSalaryCarteira + baseSalaryPorFora);

  // 13º Salário Integral Proporcional aos Avos
  const thirteenthFullCarteira = roundCurrency((baseSalaryCarteira / 12) * avos);
  const thirteenthFullPorFora = roundCurrency((baseSalaryPorFora / 12) * avos);
  const thirteenthFullCombined = roundCurrency(thirteenthFullCarteira + thirteenthFullPorFora);

  // 1ª Parcela (Adiantamento legal: 50% sem incidência de INSS)
  const firstInstallmentCarteira = roundCurrency(thirteenthFullCarteira * 0.5);
  const firstInstallmentPorFora = roundCurrency(thirteenthFullPorFora * 0.5);
  const firstInstallmentTotal = roundCurrency(firstInstallmentCarteira + firstInstallmentPorFora);

  // 2ª Parcela (Quitação com apuração do INSS oficial)
  // CLT: O INSS incide sobre o valor integral bruto do 13º (thirteenthFullCarteira)
  const { inssAmount, effectiveRate } = calculateProgressiveInss(thirteenthFullCarteira, referenceYear);
  const secondInstallmentGrossCarteira = roundCurrency(thirteenthFullCarteira - firstInstallmentCarteira);
  
  // Descontos adicionais na 2ª parcela (ex: pensão alimentícia, faltas, etc.)
  const otherDeductions = importedRef?.importedSecondInstallmentDiscounts
    ? roundCurrency(importedRef.importedSecondInstallmentDiscounts - inssAmount > 0 ? importedRef.importedSecondInstallmentDiscounts - inssAmount : 0)
    : 0;

  // 2ª Parcela Líquida Carteira = Bruto Restante - INSS Oficial - Outros Descontos
  const secondInstallmentNetCarteira = Math.max(
    0,
    roundCurrency(secondInstallmentGrossCarteira - inssAmount - otherDeductions)
  );

  // 2ª Parcela Por Fora = 50% restante da verba complementar
  const secondInstallmentPorFora = roundCurrency(thirteenthFullPorFora - firstInstallmentPorFora);
  const secondInstallmentTotalNet = roundCurrency(secondInstallmentNetCarteira + secondInstallmentPorFora);

  // Totais Finais
  const totalThirteenthCarteiraNet = roundCurrency(firstInstallmentCarteira + secondInstallmentNetCarteira);
  const totalThirteenthCombinedNet = roundCurrency(firstInstallmentTotal + secondInstallmentTotalNet);

  // Análise de Divergências com valores importados da planilha de referência
  const divergences: RhDivergence[] = [];
  if (importedRef) {
    if (
      importedRef.importedMonths !== undefined &&
      importedRef.importedMonths !== avos
    ) {
      divergences.push({
        field: 'monthsWorked',
        label: 'Quantidade de Meses (Avos)',
        importedValue: importedRef.importedMonths,
        calculatedValue: avos,
        diff: roundCurrency(avos - importedRef.importedMonths),
      });
    }

    if (
      importedRef.importedBaseCarteira !== undefined &&
      Math.abs(importedRef.importedBaseCarteira - baseSalaryCarteira) > 0.05
    ) {
      divergences.push({
        field: 'baseSalaryCarteira',
        label: 'Base Mensal Carteira',
        importedValue: importedRef.importedBaseCarteira,
        calculatedValue: baseSalaryCarteira,
        diff: roundCurrency(baseSalaryCarteira - importedRef.importedBaseCarteira),
      });
    }

    if (
      importedRef.importedBasePorFora !== undefined &&
      Math.abs(importedRef.importedBasePorFora - baseSalaryPorFora) > 0.05
    ) {
      divergences.push({
        field: 'baseSalaryPorFora',
        label: 'Base Mensal Por Fora',
        importedValue: importedRef.importedBasePorFora,
        calculatedValue: baseSalaryPorFora,
        diff: roundCurrency(baseSalaryPorFora - importedRef.importedBasePorFora),
      });
    }

    if (
      importedRef.importedFirstInstallmentCarteira !== undefined &&
      Math.abs(importedRef.importedFirstInstallmentCarteira - firstInstallmentCarteira) > 0.05
    ) {
      divergences.push({
        field: 'firstInstallmentCarteira',
        label: '1ª Parcela Carteira',
        importedValue: importedRef.importedFirstInstallmentCarteira,
        calculatedValue: firstInstallmentCarteira,
        diff: roundCurrency(firstInstallmentCarteira - importedRef.importedFirstInstallmentCarteira),
      });
    }

    if (
      importedRef.importedFirstInstallmentPorFora !== undefined &&
      Math.abs(importedRef.importedFirstInstallmentPorFora - firstInstallmentPorFora) > 0.05
    ) {
      divergences.push({
        field: 'firstInstallmentPorFora',
        label: '1ª Parcela Por Fora',
        importedValue: importedRef.importedFirstInstallmentPorFora,
        calculatedValue: firstInstallmentPorFora,
        diff: roundCurrency(firstInstallmentPorFora - importedRef.importedFirstInstallmentPorFora),
      });
    }

    if (
      importedRef.importedFirstInstallmentTotal !== undefined &&
      Math.abs(importedRef.importedFirstInstallmentTotal - firstInstallmentTotal) > 0.05
    ) {
      divergences.push({
        field: 'firstInstallmentTotal',
        label: 'Total 1ª Parcela',
        importedValue: importedRef.importedFirstInstallmentTotal,
        calculatedValue: firstInstallmentTotal,
        diff: roundCurrency(firstInstallmentTotal - importedRef.importedFirstInstallmentTotal),
      });
    }

    if (
      importedRef.importedSecondInstallmentTotal !== undefined &&
      Math.abs(importedRef.importedSecondInstallmentTotal - secondInstallmentTotalNet) > 0.05
    ) {
      divergences.push({
        field: 'secondInstallmentTotalNet',
        label: 'Total 2ª Parcela Líquida',
        importedValue: importedRef.importedSecondInstallmentTotal,
        calculatedValue: secondInstallmentTotalNet,
        diff: roundCurrency(secondInstallmentTotalNet - importedRef.importedSecondInstallmentTotal),
      });
    }
  }

  const hasDivergence = divergences.length > 0;
  const now = new Date().toISOString();

  return {
    id: `calc_${employee.id}_${referenceYear}`,
    orgId: employee.orgId,
    runId,
    referenceYear,
    employeeId: employee.id,
    employeeName: employee.name,
    codigoObra: employee.codigoObra || employee.registrationNumber || '198',
    registrationNumber: employee.codigoObra || employee.registrationNumber || '198',
    companyName: employee.companyName || 'Aguero Inox',
    unitId: employee.unitId || null,
    contractId: employee.contractId || null,
    admissionDate: employee.admissionDate,
    monthsWorked: avos,
    monthlyHours,

    hourlyRateCarteira: employee.hourlyRateCarteira,
    hourlyRatePorFora: employee.hourlyRatePorFora,
    baseSalaryCarteira,
    baseSalaryPorFora,
    baseSalaryTotal,

    thirteenthFullCarteira,
    thirteenthFullPorFora,
    thirteenthFullCombined,

    firstInstallmentCarteira,
    firstInstallmentPorFora,
    firstInstallmentTotal,

    secondInstallmentGrossCarteira,
    inssDeductionCarteira: inssAmount,
    inssEffectiveRate: effectiveRate,
    otherDeductionsCarteira: otherDeductions,
    secondInstallmentNetCarteira,

    secondInstallmentPorFora,
    secondInstallmentTotalNet,

    totalThirteenthCarteiraNet,
    totalThirteenthCombinedNet,

    importedReference: importedRef,
    divergences,
    hasDivergence,
    porForaConfirmed,
    status: hasDivergence ? 'divergente' : 'conferido',
    calculatedAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// PARSER DE PLANILHA AGUERO INOX (13º SALÁRIO 2025.xlsx - Colunas A a Q)
// ============================================================================

/**
 * Converte data de planilha (número serial Excel ou string DD/MM/AAAA ou YYYY-MM-DD) em YYYY-MM-DD.
 */
export function parseExcelDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date to JS Date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
    return jsDate.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    const s = val.trim();
    // DD/MM/YYYY or DD/MM/YY
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const m = parts[1].padStart(2, '0');
        const d = parts[0].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.substring(0, 10);
    }
  }
  return '';
}

/**
 * Converte valor numérico de célula Excel (trata R$, formatação com vírgula, strings com espaços).
 */
export function parseExcelNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : roundCurrency(val);
  }
  if (typeof val === 'string') {
    const cleaned = val
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : roundCurrency(parsed);
  }
  return 0;
}

/**
 * Analisa arquivo Excel (.xlsx) ou CSV enviado pelo usuário.
 * Retorna as abas disponíveis e os dados mapeados das colunas A a Q.
 */
export async function parseAgueroSpreadsheet(file: File): Promise<{
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
}> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames;

  // Selecionar preferencialmente a aba que não seja "Demonstrativo"
  const preferredSheet =
    sheetNames.find((s) => !s.toLowerCase().includes('demonstrativo')) ||
    sheetNames[0];

  const worksheet = workbook.Sheets[preferredSheet];
  const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawJson.length === 0) {
    throw new Error('A planilha selecionada está vazia.');
  }

  // Detectar linha de cabeçalho
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawJson.length, 10); i++) {
    const row = rawJson[i];
    const rowStr = row.map((c) => String(c).toLowerCase()).join(' ');
    if (
      rowStr.includes('funciona') ||
      rowStr.includes('valor hora') ||
      rowStr.includes('admiss') ||
      rowStr.includes('carteira')
    ) {
      headerRowIndex = i;
      break;
    }
  }

  const dataRows = headerRowIndex >= 0 ? rawJson.slice(headerRowIndex + 1) : rawJson.slice(1);
  const parsedRows: RhSpreadsheetRowData[] = [];
  let rowsWithReference = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    if (!r || r.length === 0) continue;

    const nome = String(r[0] || '').trim();
    if (!nome || nome.toLowerCase() === 'total' || nome.toLowerCase().startsWith('totais')) {
      continue; // Ignora linha de totais ou linhas em branco
    }

    const valorHoraCarteira = parseExcelNumber(r[1]);
    const valorHoraPorFora = parseExcelNumber(r[2]);
    const admissao = parseExcelDate(r[3]);
    const qntMes = parseInt(String(r[4] || '0'), 10) || 0;
    const valorTotalCarteira = parseExcelNumber(r[5]);
    const valorTotalPorFora = parseExcelNumber(r[6]);
    const carteira1aParcela = parseExcelNumber(r[7]);
    const porFora1aParcela = parseExcelNumber(r[8]);
    const carteira2aParcela = parseExcelNumber(r[9]);
    const porFora2aParcela = parseExcelNumber(r[10]);
    const total1aParcela = parseExcelNumber(r[11]);
    const descontos2aParcela = parseExcelNumber(r[12]);
    const total2aParcela = parseExcelNumber(r[13]);
    const empresa = String(r[14] || 'Aguero Inox').trim();
    const colunaP_auxiliar = String(r[15] || ''); // Coluna P auxiliar - sem significado financeiro
    const codigoRaw = String(r[16] || '').trim();
    const codigoObra = codigoRaw || '198'; // Coluna Q: Código da Obra onde o colaborador está alocado
    const codigoMatricula = codigoObra;

    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    if (!nome) validationErrors.push('Nome do colaborador é obrigatório.');
    // Valores são flexíveis: colaboradores podem ter apenas carteira, apenas por fora ou pendência salarial
    if (valorHoraCarteira < 0 || valorHoraPorFora < 0) {
      validationErrors.push('Valores monetários por hora não podem ser negativos.');
    }
    if (valorHoraCarteira === 0 && valorTotalCarteira === 0 && valorHoraPorFora === 0 && valorTotalPorFora === 0) {
      validationWarnings.push('Colaborador sem valores de hora informados (Carteira e Por Fora zerados).');
    }
    if (qntMes < 0 || qntMes > 12) {
      validationWarnings.push(`Quantidade de meses (${qntMes}) fora do intervalo usual (0 a 12).`);
    }

    const hasRef =
      carteira1aParcela > 0 ||
      total1aParcela > 0 ||
      carteira2aParcela > 0 ||
      total2aParcela > 0 ||
      valorTotalCarteira > 0;

    if (hasRef) rowsWithReference++;

    parsedRows.push({
      rowNumber: idx + (headerRowIndex >= 0 ? headerRowIndex + 2 : 2),
      nome,
      valorHoraCarteira,
      valorHoraPorFora,
      admissao,
      qntMes,
      valorTotalCarteira,
      valorTotalPorFora,
      carteira1aParcela,
      porFora1aParcela,
      carteira2aParcela,
      porFora2aParcela,
      total1aParcela,
      descontos2aParcela,
      total2aParcela,
      empresa,
      colunaP_auxiliar,
      codigoObra,
      codigoMatricula,
      isValid: validationErrors.length === 0,
      validationErrors,
      validationWarnings,
      hasReferenceValues: hasRef,
    });
  }

  const detectedMode = rowsWithReference > 0 ? 'with_values' : 'cadastral_only';
  const validCount = parsedRows.filter((r) => r.isValid).length;

  return {
    sheets: sheetNames,
    activeSheet: preferredSheet,
    rows: parsedRows,
    detectedMode,
    summary: {
      total: parsedRows.length,
      valid: validCount,
      invalid: parsedRows.length - validCount,
      withReferenceValues: rowsWithReference,
    },
  };
}

// ============================================================================
// SERVIÇOS FIRESTORE (TEMPO REAL, MULTI-EMPRESA E AUDITORIA)
// ============================================================================

export function subscribeRhEmployees(
  orgId: string,
  onData: (employees: RhEmployee[]) => void
) {
  if (!orgId) return () => {};
  const q = query(collection(db, 'rh_employees'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RhEmployee));
      items.sort((a, b) => a.name.localeCompare(b.name));
      onData(items);
    },
    (err) => {
      console.warn('Erro ao sincronizar colaboradores de RH:', err);
    }
  );
}

export function subscribeRhCalculations(
  orgId: string,
  referenceYear: number,
  onData: (calculations: RhThirteenthCalculation[]) => void
) {
  if (!orgId) return () => {};
  const q = query(
    collection(db, 'rh_calculations'),
    where('orgId', '==', orgId),
    where('referenceYear', '==', referenceYear)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as RhThirteenthCalculation)
      );
      items.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      onData(items);
    },
    (err) => {
      console.warn('Erro ao sincronizar cálculos de 13º:', err);
    }
  );
}

export function subscribeRhImports(
  orgId: string,
  onData: (imports: RhImportBatch[]) => void
) {
  if (!orgId) return () => {};
  const q = query(collection(db, 'rh_imports'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RhImportBatch));
      items.sort(
        (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
      );
      onData(items);
    },
    (err) => {
      console.warn('Erro ao sincronizar histórico de importações:', err);
    }
  );
}

export function subscribeRhBatches(
  orgId: string,
  onData: (batches: RhCalculationBatch[]) => void
) {
  if (!orgId) return () => {};
  const q = query(collection(db, 'rh_batches'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RhCalculationBatch));
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      onData(items);
    },
    (err) => {
      console.warn('Erro ao sincronizar lotes de cálculo:', err);
    }
  );
}

/**
 * Sanitiza objetos recursivamente para o Firestore, removendo qualquer chave
 * com valor 'undefined' para impedir o erro "Unsupported field value: undefined".
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanFirestoreData(item)) as any;
  }
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = typeof value === 'object' && value !== null ? cleanFirestoreData(value) : value;
    }
  }
  return cleaned;
}

/**
 * Sincroniza um colaborador cadastrado no Módulo de RH / Salários com
 * a coleção 'field_workers' utilizada pelo Módulo 13 (Obras / Colaboradores de Campo).
 * Preserva NRs, certificações e histórico caso o colaborador já exista em campo.
 */
export async function syncRhEmployeeToFieldWorker(employee: RhEmployee): Promise<void> {
  if (!employee || !employee.orgId) return;

  const fwId = `fw_${employee.id.replace(/^emp_/, '')}`;
  const ref = doc(db, 'field_workers', fwId);

  let existingData: Partial<FieldWorker> | null = null;
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      existingData = existingSnap.data() as Partial<FieldWorker>;
    } else {
      // Tenta localizar por nome no mesmo orgId para evitar duplicações
      const qName = query(
        collection(db, 'field_workers'),
        where('orgId', '==', employee.orgId),
        where('name', '==', employee.name.trim())
      );
      const snapName = await getDocs(qName);
      if (!snapName.empty) {
        existingData = snapName.docs[0].data() as Partial<FieldWorker>;
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar field_worker existente:', err);
  }

  const totalBaseSalary = roundCurrency(
    (employee.baseSalaryCarteira || 0) + (employee.baseSalaryPorFora || 0)
  );
  const totalHourlyRate = roundCurrency(
    (employee.hourlyRateCarteira || 0) + (employee.hourlyRatePorFora || 0)
  );
  const obraCode = employee.codigoObra || employee.registrationNumber || '198';
  const siteName = `Obra ${obraCode}`;

  const targetId = existingData?.id || fwId;
  // Histórico de salário mora em field_worker_pay (só RH lê); field_workers antigos ainda podem tê-lo.
  const existingPay = await getDoc(doc(db, PAY_COLLECTION, targetId))
    .then((s) => (s.exists() ? (s.data() as Partial<FieldWorker>) : null))
    .catch(() => null);
  if (existingData && existingPay?.salaryHistory) existingData = { ...existingData, salaryHistory: existingPay.salaryHistory };
  const workerData: FieldWorker = {
    id: targetId,
    orgId: employee.orgId,
    rhEmployeeId: employee.id,
    name: employee.name.trim(),
    cpf: existingData?.cpf || '',
    role: employee.role || existingData?.role || 'Colaborador',
    baseSalary: totalBaseSalary > 0 ? totalBaseSalary : existingData?.baseSalary || 3500,
    hourlyRate: totalHourlyRate > 0 ? totalHourlyRate : existingData?.hourlyRate || 15.91,
    currentSite: existingData?.currentSite || siteName,
    status: employee.active ? 'ativo' : 'desligado',
    admissionDate: employee.admissionDate || existingData?.admissionDate || '2024-01-01',
    certifications: existingData?.certifications || [],
    nrCertifications: existingData?.nrCertifications || [],
    salaryHistory: existingData?.salaryHistory || [
      {
        date: employee.admissionDate || '2024-01-01',
        previousSalary: 0,
        newSalary: totalBaseSalary > 0 ? totalBaseSalary : 3500,
        previousRole: 'Admissão',
        newRole: employee.role || 'Colaborador',
        reason: 'Cadastro integrado via Módulo RH / Salários',
      },
    ],
    shiftId: existingData?.shiftId,
    shiftName: existingData?.shiftName,
    customCalculationRules: existingData?.customCalculationRules,
    createdAt: existingData?.createdAt || employee.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveFieldWorker(cleanFirestoreData(workerData) as unknown as FieldWorker & Record<string, unknown>);
}

/**
 * Sincroniza em lote todos os colaboradores de RH da organização
 * para os colaboradores de campo do Módulo 13 (Obras).
 */
export async function syncAllRhEmployeesToFieldWorkers(orgId: string): Promise<number> {
  if (!orgId) return 0;
  const qEmp = query(collection(db, 'rh_employees'), where('orgId', '==', orgId));
  const snap = await getDocs(qEmp);
  let count = 0;
  for (const d of snap.docs) {
    const emp = { id: d.id, ...d.data() } as RhEmployee;
    await syncRhEmployeeToFieldWorker(emp);
    count++;
  }
  return count;
}

/**
 * Regrava o diretório de pessoas (sem salários) a partir do cadastro do RH.
 * Roda quando alguém com acesso ao RH abre o módulo, para cobrir funcionários
 * gravados antes do diretório existir. Apaga entradas de quem saiu do RH.
 */
export async function syncRhDirectory(orgId: string): Promise<number> {
  if (!orgId) return 0;
  const [emps, dir] = await Promise.all([
    getDocs(query(collection(db, 'rh_employees'), where('orgId', '==', orgId))),
    getDocs(query(collection(db, 'rh_directory'), where('orgId', '==', orgId))),
  ]);
  // Só o que mudou: regravar tudo a cada abertura do RH dispararia todas as telas de Operações.
  const ops = directoryChanges(
    emps.docs.map((d) => ({ ...(d.data() as RhEmployee), id: d.id })),
    dir.docs.map((d) => ({ id: d.id, data: d.data() })),
  );
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      const ref = doc(db, 'rh_directory', op.id);
      if (op.kind === 'delete') b.delete(ref);
      else b.set(ref, cleanFirestoreData(op.data));
    }
    await b.commit();
  }
  return emps.size;
}

export async function saveRhEmployee(employee: RhEmployee): Promise<void> {
  const ref = doc(db, 'rh_employees', employee.id);
  const data = cleanFirestoreData({
    ...employee,
    codigoObra: employee.codigoObra || employee.registrationNumber || '198',
    registrationNumber: employee.codigoObra || employee.registrationNumber || '198',
    unitId: employee.unitId || null,
    contractId: employee.contractId || null,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(ref, data);
  await setDoc(doc(db, 'rh_directory', employee.id), cleanFirestoreData(toDirectoryEntry(data as RhEmployee)));

  // Sincroniza automaticamente com o Módulo 13 (Obras / Colaboradores de Campo)
  try {
    await syncRhEmployeeToFieldWorker(employee);
  } catch (err) {
    console.warn('Erro ao sincronizar colaborador para o Módulo 13 (field_workers):', err);
  }
}

export async function deleteRhEmployee(id: string): Promise<void> {
  await deleteDoc(doc(db, 'rh_employees', id));
  await deleteDoc(doc(db, 'rh_directory', id));
  try {
    const fwId = `fw_${id.replace(/^emp_/, '')}`;
    const fwRef = doc(db, 'field_workers', fwId);
    const snap = await getDoc(fwRef);
    if (snap.exists()) {
      await updateDoc(fwRef, { status: 'desligado', updatedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.warn('Erro ao atualizar status do colaborador de campo:', err);
  }
}

export async function saveRhCalculation(calc: RhThirteenthCalculation): Promise<void> {
  const ref = doc(db, 'rh_calculations', calc.id);
  const data = cleanFirestoreData({
    ...calc,
    codigoObra: calc.codigoObra || calc.registrationNumber || '198',
    registrationNumber: calc.codigoObra || calc.registrationNumber || '198',
    unitId: calc.unitId || null,
    contractId: calc.contractId || null,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(ref, data);
}

export async function saveRhImportBatch(batch: RhImportBatch): Promise<void> {
  const ref = doc(db, 'rh_imports', batch.id);
  await setDoc(ref, cleanFirestoreData(batch));
}

export async function saveRhCalculationBatch(batch: RhCalculationBatch): Promise<void> {
  const ref = doc(db, 'rh_batches', batch.id);
  await setDoc(ref, cleanFirestoreData(batch));
}

// ============================================================================
// CARGA DE DADOS DE DEMONSTRAÇÃO (AGUERO INOX - 13º SALÁRIO 2025)
// ============================================================================

export async function seedRhDemoData(orgId: string, userEmail: string): Promise<void> {
  if (!orgId) return;

  const demoEmployees: Partial<RhEmployee>[] = [
    {
      registrationNumber: 'AG-0101',
      name: 'Adilson Silveira Ramos [Demonstração ilustrativa — dados fictícios]',
      department: 'Caldeiraria & Solda',
      role: 'Caldeireiro Especialista',
      companyName: 'Aguero Inox',
      admissionDate: '2021-03-15',
      hourlyRateCarteira: 19.5,
      hourlyRatePorFora: 4.8,
      monthlyHours: 220,
      porForaEligible: true,
      active: true,
    },
    {
      registrationNumber: 'AG-0102',
      name: 'Bruno Henrique Ferreira [Demonstração ilustrativa — dados fictícios]',
      department: 'Montagem Industrial',
      role: 'Montador Mecânico',
      companyName: 'Aguero Inox',
      admissionDate: '2024-04-10',
      hourlyRateCarteira: 16.8,
      hourlyRatePorFora: 3.5,
      monthlyHours: 220,
      porForaEligible: true,
      active: true,
    },
    {
      registrationNumber: 'AG-0103',
      name: 'Claudio Roberto Nascimento [Demonstração ilustrativa — dados fictícios]',
      department: 'Usinagem & Acabamento',
      role: 'Torneiro Mecânico CNC',
      companyName: 'Aguero Inox',
      admissionDate: '2023-01-20',
      hourlyRateCarteira: 22.0,
      hourlyRatePorFora: 5.5,
      monthlyHours: 220,
      porForaEligible: true,
      active: true,
    },
    {
      registrationNumber: 'AG-0104',
      name: 'Diego Martins de Souza [Demonstração ilustrativa — dados fictícios]',
      department: 'Solda TIG & Inox',
      role: 'Soldador Qualificado TIG',
      companyName: 'Aguero Inox',
      admissionDate: '2025-05-18', // Admitido no ano após o dia 15 (7 avos)
      hourlyRateCarteira: 24.5,
      hourlyRatePorFora: 6.0,
      monthlyHours: 220,
      porForaEligible: true,
      active: true,
    },
    {
      registrationNumber: 'AG-0105',
      name: 'Everton Luiz Santana [Demonstração ilustrativa — dados fictícios]',
      department: 'Pintura & Jateamento',
      role: 'Operador de Acabamento',
      companyName: 'Aguero Inox',
      admissionDate: '2022-08-01',
      hourlyRateCarteira: 15.0,
      hourlyRatePorFora: 0.0,
      monthlyHours: 220,
      porForaEligible: false,
      active: true,
    },
    {
      registrationNumber: 'AG-0106',
      name: 'Fernando Augusto Lima [Demonstração ilustrativa — dados fictícios]',
      department: 'Supervisão Operacional',
      role: 'Encarregado Geral de Obras',
      companyName: 'Aguero Inox',
      admissionDate: '2019-11-05',
      hourlyRateCarteira: 32.0,
      hourlyRatePorFora: 8.0,
      monthlyHours: 220,
      porForaEligible: true,
      active: true,
    },
  ];

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const createdEmployees: RhEmployee[] = [];

  for (const emp of demoEmployees) {
    const empId = `emp_${emp.registrationNumber?.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${orgId}`;
    const baseSalCarteira = roundCurrency((emp.hourlyRateCarteira || 0) * 220);
    const baseSalPorFora = roundCurrency((emp.hourlyRatePorFora || 0) * 220);

    const fullEmp: RhEmployee = {
      id: empId,
      orgId,
      registrationNumber: emp.registrationNumber || 'MAT-0000',
      name: emp.name || '',
      admissionDate: emp.admissionDate || '2024-01-01',
      active: true,
      department: emp.department || 'Geral',
      role: emp.role || 'Colaborador',
      companyName: emp.companyName || 'Aguero Inox',
      hourlyRateCarteira: emp.hourlyRateCarteira || 0,
      hourlyRatePorFora: emp.hourlyRatePorFora || 0,
      monthlyHours: 220,
      baseSalaryCarteira: baseSalCarteira,
      baseSalaryPorFora: baseSalPorFora,
      porForaEligible: emp.porForaEligible ?? true,
      notes: 'Registro criado para demonstração operacional do provisionamento de 13º salário.',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(doc(db, 'rh_employees', empId), fullEmp);
    batch.set(doc(db, 'rh_directory', empId), cleanFirestoreData(toDirectoryEntry(fullEmp)));
    createdEmployees.push(fullEmp);

    // Gerar cálculo de 13º correspondente com simulação de conferência
    const calc = calculateEmployeeThirteenth({
      employee: fullEmp,
      referenceYear: 2025,
      monthlyHours: 220,
      porForaConfirmed: true,
      runId: 'run_demo_2025',
    });
    calc.isDemo = true;
    batch.set(doc(db, 'rh_calculations', calc.id), calc);
  }

  // Criar lote inicial de cálculo para o ano de 2025
  const batchId = `batch_2025_${orgId}`;
  const batchDoc: RhCalculationBatch = {
    id: batchId,
    orgId,
    referenceYear: 2025,
    title: 'Provisionamento Anual do 13º Salário 2025 [Demonstração ilustrativa — dados fictícios]',
    totalEmployees: createdEmployees.length,
    totalGrossCarteira: 148500,
    totalInssDeduction: 14220,
    totalNetCarteira: 134280,
    totalPorFora: 32400,
    totalCombined: 166680,
    divergentCount: 0,
    approvedCount: createdEmployees.length,
    status: 'em_conferencia',
    createdBy: userEmail,
    createdByName: 'Administrador AgueroFlow',
    createdAt: now,
    updatedAt: now,
    isDemo: true,
  };
  batch.set(doc(db, 'rh_batches', batchId), batchDoc);

  await batch.commit();

  // Sincroniza colaboradores de demonstração com o Módulo 13 (field_workers)
  for (const emp of createdEmployees) {
    try {
      await syncRhEmployeeToFieldWorker(emp);
    } catch (e) {
      // ignore
    }
  }
}
