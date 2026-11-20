import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetWorker,
  CollectiveAssetMovement,
  CollectiveAssetService,
  CollectiveAssetPolicy,
  computeCollectiveAssetCalculations,
} from '../types/collectiveAssets';

export interface CheckoutParams {
  orgId?: string;
  organizationId?: string;
  unitId?: string;
  contractId?: string;
  assetId?: string;
  asset?: CollectiveAsset;
  workerId?: string;
  worker?: CollectiveAssetWorker;
  checkoutDate: string; // ISO string
  checkoutNotes?: string;
  releasedBy: string;
  expectedReturnDate?: string;
  userRole?: string;
}

export interface ReturnParams {
  orgId?: string;
  organizationId?: string;
  movementId: string;
  returnDate: string; // ISO string
  returnCondition: 'ok' | 'danificado' | 'faltando_acessorio' | 'precisa_manutencao' | string;
  receivedBy: string;
  returnNotes?: string;
  returnAttachments?: Array<{ url: string; name: string; type?: string; uploadedAt: string }>;
  returnEvidenceUrl?: string;
  forwardToMaintenance?: boolean;
  asset?: CollectiveAsset;
  userRole?: string;
}

export interface ServiceParams {
  orgId?: string;
  organizationId?: string;
  unitId?: string;
  assetId?: string;
  asset?: CollectiveAsset;
  serviceDate: string; // YYYY-MM-DD
  type?: 'manutencao_preventiva' | 'manutencao_corretiva' | 'calibracao';
  serviceType?: 'preventive_maintenance' | 'corrective_maintenance' | 'calibration' | string;
  performer?: string;
  performedBy?: string;
  certificateOrOsNumber?: string;
  certificateOrOrderNumber?: string;
  result: 'aprovado' | 'aprovado_com_ajuste' | 'reprovado' | 'approved' | 'approved_with_adjustment' | 'disapproved' | string;
  notes?: string;
  attachments?: Array<{ url: string; name: string; type?: string; uploadedAt: string }>;
  attachmentUrl?: string;
  recordedBy?: string;
  restoreAssetToActive?: boolean;
  userRole?: string;
}

/**
 * Realiza retirada de bem utilizando TRANSAÇÃO ATÔMICA no Firestore para
 * impedir duas retiradas simultâneas do mesmo bem (concorrência e consistência absoluta).
 */
export async function executeAssetCheckout(params: CheckoutParams): Promise<{ success: boolean; movementId: string }> {
  const orgId = params.orgId || params.organizationId || params.asset?.orgId;
  const assetId = params.assetId || params.asset?.id;
  const workerId = params.workerId || params.worker?.id;
  const {
    unitId,
    contractId,
    checkoutDate,
    checkoutNotes,
    releasedBy,
    expectedReturnDate,
  } = params;

  if (!orgId || !assetId || !workerId || !checkoutDate) {
    throw new Error('Parâmetros obrigatórios ausentes para retirada (Organização, Bem, Colaborador e Data/Hora).');
  }

  const assetRef = doc(db, 'collective_assets', assetId);
  const workerRef = doc(db, 'collective_asset_workers', workerId);
  const policyRef = doc(db, 'collective_asset_policies', orgId);

  const movementId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const movementRef = doc(db, 'collective_asset_movements', movementId);

  return await runTransaction(db, async (transaction) => {
    // 1. Lê o bem
    const assetSnap = await transaction.get(assetRef);
    if (!assetSnap.exists()) {
      throw new Error('O bem especificado não foi encontrado no sistema.');
    }
    const assetData = assetSnap.data() as CollectiveAsset;
    if (assetData.orgId !== orgId) {
      throw new Error('Acesso negado: o bem pertence a outra organização.');
    }

    // 2. Valida condição do bem
    if (assetData.condition === 'baixado') {
      throw new Error(`O bem "${assetData.code}" está baixado e não pode ser retirado.`);
    }
    if (assetData.condition === 'em_manutencao') {
      throw new Error(`O bem "${assetData.code}" está em manutenção e não pode ser retirado.`);
    }

    // 3. Lê o colaborador
    const workerSnap = await transaction.get(workerRef);
    if (!workerSnap.exists()) {
      throw new Error('Colaborador não encontrado.');
    }
    const workerData = workerSnap.data() as CollectiveAssetWorker;
    if (workerData.orgId !== orgId) {
      throw new Error('Acesso negado: colaborador pertence a outra organização.');
    }
    if (!workerData.active) {
      throw new Error(`O colaborador "${workerData.name}" está inativo e não pode retirar bens coletivos.`);
    }

    // 4. Lê a política da organização para checar bloqueios
    const policySnap = await transaction.get(policyRef);
    const policy = policySnap.exists() ? (policySnap.data() as CollectiveAssetPolicy) : undefined;

    // 5. Verifica se já existe retirada aberta registrada no bem
    if (assetData.currentCheckout) {
      throw new Error(
        `O bem "${assetData.code}" já está emprestado para ${assetData.currentCheckout.workerName}. Não é permitida mais de uma retirada aberta simultânea.`
      );
    }

    // 6. Grava a movimentação
    const newMovement: CollectiveAssetMovement = {
      id: movementId,
      orgId,
      unitId: unitId || assetData.unitId,
      contractId,
      assetId,
      assetCode: assetData.code,
      assetDescription: assetData.description,
      workerId,
      workerName: workerData.name,
      workerRegistration: workerData.registrationNumber,
      checkoutDate,
      checkoutNotes: checkoutNotes?.trim() || undefined,
      releasedBy,
      expectedReturnDate: expectedReturnDate || undefined,
      returnDate: null,
      returnCondition: null,
      receivedBy: null,
      status: 'EM_USO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    transaction.set(movementRef, newMovement);

    // 7. Atualiza o ponteiro de checkout no bem
    transaction.update(assetRef, {
      currentCheckout: {
        movementId,
        workerId,
        workerName: workerData.name,
        workerRegistration: workerData.registrationNumber,
        checkoutDate,
        isLate: false,
      },
      updatedAt: new Date().toISOString(),
    });

    // 8. Grava log de auditoria
    const auditId = `aud_asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const auditRef = doc(db, 'audit_logs', auditId);
    transaction.set(auditRef, {
      id: auditId,
      orgId,
      userId: releasedBy,
      userEmail: releasedBy,
      module: 'Bens Coletivos',
      action: 'Retirada de Bem',
      targetId: assetId,
      details: `Retirada do bem ${assetData.code} (${assetData.description}) por ${workerData.name} (Matrícula: ${workerData.registrationNumber})`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, movementId };
  });
}

/**
 * Realiza devolução de bem utilizando TRANSAÇÃO ATÔMICA no Firestore.
 * Valida data/hora, condição e libera o bem para novas retiradas.
 */
export async function executeAssetReturn(params: ReturnParams): Promise<{ success: boolean }> {
  const {
    movementId,
    returnDate,
    returnCondition,
    receivedBy,
    returnNotes,
    returnAttachments,
    returnEvidenceUrl,
    forwardToMaintenance,
  } = params;

  if (!movementId || !returnDate || !returnCondition) {
    throw new Error('Parâmetros obrigatórios ausentes para devolução.');
  }

  const movementRef = doc(db, 'collective_asset_movements', movementId);

  return await runTransaction(db, async (transaction) => {
    const movSnap = await transaction.get(movementRef);
    if (!movSnap.exists()) {
      throw new Error('Registro de movimentação não localizado.');
    }
    const movement = movSnap.data() as CollectiveAssetMovement;
    const orgId = params.orgId || params.organizationId || movement.orgId;
    if (movement.orgId !== orgId) {
      throw new Error('Acesso negado: movimentação pertence a outra organização.');
    }
    if (movement.returnDate) {
      throw new Error('Esta retirada já foi devolvida anteriormente.');
    }

    // Validação temporal: devolução não pode ser anterior à saída
    const outTime = new Date(movement.checkoutDate).getTime();
    const inTime = new Date(returnDate).getTime();
    if (inTime < outTime) {
      throw new Error('A data/hora de devolução não pode ser anterior à data/hora de saída.');
    }

    const assetRef = doc(db, 'collective_assets', movement.assetId);

    const attachmentsList = returnAttachments ? [...returnAttachments] : [];
    if (returnEvidenceUrl) {
      attachmentsList.push({
        url: returnEvidenceUrl,
        name: 'Evidência de Devolução',
        uploadedAt: new Date().toISOString(),
      });
    }

    // Normalização da condição
    let normalizedCondition: any = returnCondition;
    if (returnCondition === 'damaged') normalizedCondition = 'danificado';
    if (returnCondition === 'missing_accessory') normalizedCondition = 'faltando_acessorio';
    if (returnCondition === 'needs_maintenance') normalizedCondition = 'precisa_manutencao';

    // Atualiza a movimentação
    transaction.update(movementRef, {
      returnDate,
      returnCondition: normalizedCondition,
      receivedBy,
      returnNotes: returnNotes?.trim() || null,
      returnAttachments: attachmentsList,
      status: 'DEVOLVIDO',
      updatedAt: new Date().toISOString(),
    });

    // Atualiza o bem (limpa o checkout e opcionalmente altera condição para em_manutencao)
    const assetUpdates: any = {
      currentCheckout: null,
      updatedAt: new Date().toISOString(),
    };
    if (forwardToMaintenance) {
      assetUpdates.condition = 'em_manutencao';
    }
    transaction.update(assetRef, assetUpdates);

    // Auditoria
    const auditId = `aud_asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const auditRef = doc(db, 'audit_logs', auditId);
    transaction.set(auditRef, {
      id: auditId,
      orgId,
      userId: receivedBy,
      userEmail: receivedBy,
      module: 'Bens Coletivos',
      action: 'Devolução de Bem',
      targetId: movement.assetId,
      details: `Devolução do bem ${movement.assetCode} recebida por ${receivedBy}. Condição: ${String(normalizedCondition).toUpperCase()}${forwardToMaintenance ? ' [Encaminhado para Manutenção]' : ''}${returnNotes ? ` — Obs: ${returnNotes}` : ''}`,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });
}

/**
 * Registra um serviço de manutenção ou calibração com validação temporal.
 */
export async function recordAssetService(params: ServiceParams): Promise<{ success: boolean; serviceId: string }> {
  const assetId = params.assetId || params.asset?.id;
  const { serviceDate, notes } = params;

  if (!assetId || !serviceDate) {
    throw new Error('Preencha os campos obrigatórios do serviço (Bem e Data de Realização).');
  }

  // Validação: não permitir data futura
  const todayStr = new Date().toISOString().split('T')[0];
  if (serviceDate > todayStr) {
    throw new Error('Não é permitido registrar manutenção ou calibração com data futura.');
  }

  const assetSnap = await getDoc(doc(db, 'collective_assets', assetId));
  if (!assetSnap.exists()) {
    throw new Error('Bem não encontrado.');
  }
  const asset = assetSnap.data() as CollectiveAsset;
  const orgId = params.orgId || params.organizationId || asset.orgId;

  // Normalização de tipo
  const rawType = params.type || params.serviceType || 'manutencao_preventiva';
  let type: any = rawType;
  if (rawType === 'preventive_maintenance') type = 'manutencao_preventiva';
  if (rawType === 'corrective_maintenance') type = 'manutencao_corretiva';
  if (rawType === 'calibration') type = 'calibracao';

  // Normalização de resultado
  const rawResult = params.result || 'aprovado';
  let result: any = rawResult;
  if (rawResult === 'approved') result = 'aprovado';
  if (rawResult === 'approved_with_adjustment') result = 'aprovado_com_ajuste';
  if (rawResult === 'disapproved') result = 'reprovado';

  const performer = (params.performer || params.performedBy || 'Técnico Responsável').trim();
  const certificateOrOsNumber = (params.certificateOrOsNumber || params.certificateOrOrderNumber || '').trim();

  const attachmentsList = params.attachments ? [...params.attachments] : [];
  if (params.attachmentUrl) {
    attachmentsList.push({
      url: params.attachmentUrl,
      name: 'Laudo / Certificado',
      uploadedAt: new Date().toISOString(),
    });
  }

  const serviceId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const serviceData: CollectiveAssetService = {
    id: serviceId,
    orgId,
    unitId: params.unitId || asset.unitId,
    assetId,
    assetCode: asset.code,
    serviceDate,
    type,
    performer,
    certificateOrOsNumber: certificateOrOsNumber || undefined,
    result,
    notes: notes?.trim() || undefined,
    attachments: attachmentsList,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'collective_asset_services', serviceId), serviceData);

  // Se o bem estava em manutenção e foi solicitado retorno para ativo com laudo não reprovado
  if (params.restoreAssetToActive && result !== 'reprovado') {
    await updateDoc(doc(db, 'collective_assets', assetId), {
      condition: 'ativo',
      updatedAt: new Date().toISOString(),
    });
  }

  // Registra auditoria
  const auditId = `aud_srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  await setDoc(doc(db, 'audit_logs', auditId), {
    id: auditId,
    orgId,
    userId: params.recordedBy || 'Sistema',
    userEmail: params.recordedBy || 'Almoxarifado',
    module: 'Bens Coletivos',
    action: 'Registro de Serviço',
    targetId: assetId,
    details: `${type === 'calibracao' ? 'Calibração' : type === 'manutencao_preventiva' ? 'Manutenção Preventiva' : 'Manutenção Corretiva'} registrada para ${asset.code}. Resultado: ${String(result).toUpperCase()}`,
    timestamp: new Date().toISOString(),
  });

  return { success: true, serviceId };
}

/**
 * Validação de unicidade de código de bem na organização.
 */
export async function validateAssetCodeUnique(orgId: string, code: string, currentAssetId?: string): Promise<boolean> {
  const q = query(
    collection(db, 'collective_assets'),
    where('orgId', '==', orgId),
    where('code', '==', code.trim().toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  if (currentAssetId && snap.docs.length === 1 && snap.docs[0].id === currentAssetId) {
    return true;
  }
  return false;
}

/**
 * Validação de unicidade de matrícula de colaborador na organização.
 */
export async function validateWorkerRegistrationUnique(
  orgId: string,
  registration: string,
  currentWorkerId?: string
): Promise<boolean> {
  const q = query(
    collection(db, 'collective_asset_workers'),
    where('orgId', '==', orgId),
    where('registrationNumber', '==', registration.trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  if (currentWorkerId && snap.docs.length === 1 && snap.docs[0].id === currentWorkerId) {
    return true;
  }
  return false;
}

/**
 * Validação de unicidade de categoria na organização.
 */
export async function validateCategoryNameUnique(
  orgId: string,
  name: string,
  currentCategoryId?: string
): Promise<boolean> {
  const q = query(
    collection(db, 'collective_asset_categories'),
    where('orgId', '==', orgId),
    where('name', '==', name.trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return true;
  if (currentCategoryId && snap.docs.length === 1 && snap.docs[0].id === currentCategoryId) {
    return true;
  }
  return false;
}

/**
 * Carrega e popula dados de demonstração (marcando explicitamente como 'Dados de demonstração')
 */
export async function seedCollectiveAssetsDemo(orgId: string, userEmail: string): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 1. Categorias de Demonstração
  const sampleCategories: CollectiveAssetCategory[] = [
    {
      id: `cat_eletrica_${orgId}`,
      orgId,
      name: 'Ferramentas Elétricas & Soldagem',
      description: 'Inversoras TIG/MIG, lixadeiras, furadeiras magnéticas e marteletes',
      preventiveMaintenanceIntervalMonths: 6,
      calibrationIntervalMonths: 12,
      warningDays: 30,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `cat_medicao_${orgId}`,
      orgId,
      name: 'Instrumentos de Medição & Metrologia',
      description: 'Paquímetros digitais, micrômetros, manômetros calibrados e trenas laser',
      preventiveMaintenanceIntervalMonths: 0, // Não aplicável
      calibrationIntervalMonths: 12,
      warningDays: 30,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `cat_seguranca_${orgId}`,
      orgId,
      name: 'Equipamentos de Resgate & Altura (NR-35)',
      description: 'Trava-quedas retráteis, cintos paraquedistas, tripés de resgate e talabartes duplos',
      preventiveMaintenanceIntervalMonths: 12,
      calibrationIntervalMonths: 0,
      warningDays: 45,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `cat_confinado_${orgId}`,
      orgId,
      name: 'Detecção de Gases & Espaço Confinado (NR-33)',
      description: 'Detectores 4 gases portáteis, insufladores e exaustores centrífugos',
      preventiveMaintenanceIntervalMonths: 6,
      calibrationIntervalMonths: 6,
      warningDays: 30,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const cat of sampleCategories) {
    await setDoc(doc(db, 'collective_asset_categories', cat.id), cat);
  }

  // 2. Colaboradores de Demonstração
  const sampleWorkers: CollectiveAssetWorker[] = [
    {
      id: `wrk_101_${orgId}`,
      orgId,
      registrationNumber: 'MAT-101',
      name: 'Gilfran Bispo',
      department: 'Montagem Industrial',
      role: 'Serralheiro Líder',
      active: true,
      isDemo: true,
      notes: '[Dados de demonstração]',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `wrk_102_${orgId}`,
      orgId,
      registrationNumber: 'MAT-102',
      name: 'Marcos Vinicius Andrade',
      department: 'Caldeiraria Inox',
      role: 'Soldador Especialista TIG',
      active: true,
      isDemo: true,
      notes: '[Dados de demonstração]',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `wrk_103_${orgId}`,
      orgId,
      registrationNumber: 'MAT-103',
      name: 'Rodrigo Santoro de Oliveira',
      department: 'Montagem de Campo',
      role: 'Caldeireiro Montador',
      active: true,
      isDemo: true,
      notes: '[Dados de demonstração]',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `wrk_104_${orgId}`,
      orgId,
      registrationNumber: 'MAT-104',
      name: 'Claudinei Ramos Silva',
      department: 'Oficina Central',
      role: 'Ajudante Geral',
      active: false, // Inativo de demonstração
      isDemo: true,
      notes: '[Dados de demonstração] Colaborador inativo para teste de bloqueio de retirada.',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const w of sampleWorkers) {
    await setDoc(doc(db, 'collective_asset_workers', w.id), w);
  }

  // 3. Bens de Demonstração
  const sampleAssets: CollectiveAsset[] = [
    {
      id: `ast_tig01_${orgId}`,
      orgId,
      code: 'INV-TIG-001',
      description: 'Inversora de Solda TIG 200A com Purga Inox',
      categoryId: `cat_eletrica_${orgId}`,
      categoryName: 'Ferramentas Elétricas & Soldagem',
      brandModel: 'Miller Maxstar 210 DX',
      serialNumber: 'SN-MILLER-98214',
      storageLocation: 'Almoxarifado Central - Prateleira A1',
      condition: 'ativo',
      notes: '[Dados de demonstração] Inversora calibrada para soldagem sanitária.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ast_det01_${orgId}`,
      orgId,
      code: 'GAS-DET-001',
      description: 'Detector de 4 Gases Portátil (O2, LEL, CO, H2S)',
      categoryId: `cat_confinado_${orgId}`,
      categoryName: 'Detecção de Gases & Espaço Confinado (NR-33)',
      brandModel: 'MSA Altair 4XR',
      serialNumber: 'MSA-4XR-7712',
      storageLocation: 'Armário de Resgate - Almoxarifado',
      condition: 'ativo',
      notes: '[Dados de demonstração] Crítico para entradas em tanques inox.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ast_paq01_${orgId}`,
      orgId,
      code: 'PAQ-DIG-002',
      description: 'Paquímetro Digital Milesimal 300mm',
      categoryId: `cat_medicao_${orgId}`,
      categoryName: 'Instrumentos de Medição & Metrologia',
      brandModel: 'Mitutoyo 500-196-30',
      serialNumber: 'MIT-500-4491',
      storageLocation: 'Gaveteiro de Metrologia',
      condition: 'ativo',
      notes: '[Dados de demonstração] Utilizado para inspeção de espessura de chapas 316L.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ast_tq01_${orgId}`,
      orgId,
      code: 'TRV-ALT-005',
      description: 'Trava-quedas Retrátil Cabo de Aço 15m (NR-35)',
      categoryId: `cat_seguranca_${orgId}`,
      categoryName: 'Equipamentos de Resgate & Altura (NR-35)',
      brandModel: '3M DBI-SALA Ultra-Lok',
      serialNumber: '3M-DBI-9923',
      storageLocation: 'Cabideiro de EPIs Pesados',
      condition: 'ativo',
      notes: '[Dados de demonstração] Inspecionado para montagens de mezanino.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ast_mar01_${orgId}`,
      orgId,
      code: 'MAR-ELET-003',
      description: 'Furadeira Magnética de Base Eletromagnética 50mm',
      categoryId: `cat_eletrica_${orgId}`,
      categoryName: 'Ferramentas Elétricas & Soldagem',
      brandModel: 'Euroboor ECO.50',
      serialNumber: 'EB-ECO50-2091',
      storageLocation: 'Bancada de Manutenção',
      condition: 'em_manutencao',
      notes: '[Dados de demonstração] Em manutenção preventiva de escovas e fiação.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const ast of sampleAssets) {
    await setDoc(doc(db, 'collective_assets', ast.id), ast);
  }

  // 4. Histórico de Serviços de Demonstração
  const sampleServices: CollectiveAssetService[] = [
    {
      id: `srv_demo1_${orgId}`,
      orgId,
      assetId: `ast_tig01_${orgId}`,
      assetCode: 'INV-TIG-001',
      serviceDate: '2024-05-10',
      type: 'manutencao_preventiva',
      performer: 'Assistência Técnica Autorizada Miller SP',
      certificateOrOsNumber: 'OS-MILLER-4091',
      result: 'aprovado',
      notes: '[Dados de demonstração] Limpeza interna, revisão da placa de alta frequência e teste de carga.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `srv_demo2_${orgId}`,
      orgId,
      assetId: `ast_det01_${orgId}`,
      assetCode: 'GAS-DET-001',
      serviceDate: '2024-09-01',
      type: 'calibracao',
      performer: 'Laboratório RBC CalibraTech',
      certificateOrOsNumber: 'CERT-RBC-2024-889',
      result: 'aprovado',
      notes: '[Dados de demonstração] Calibração com gás padrão 4 misturas rastreado RBC.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `srv_demo3_${orgId}`,
      orgId,
      assetId: `ast_paq01_${orgId}`,
      assetCode: 'PAQ-DIG-002',
      serviceDate: '2024-03-15',
      type: 'calibracao',
      performer: 'Metrologia Industrial Santos Dumont',
      certificateOrOsNumber: 'CAL-MIT-33291',
      result: 'aprovado',
      notes: '[Dados de demonstração] Bloco padrão classe 0 rastreabilidade Inmetro.',
      isDemo: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const srv of sampleServices) {
    await setDoc(doc(db, 'collective_asset_services', srv.id), srv);
  }

  // 5. Política padrão
  await setDoc(doc(db, 'collective_asset_policies', orgId), {
    orgId,
    blockOnNoHistory: false, // Pode apenas alertar por padrão
    defaultWarningDays: 30,
    updatedAt: now.toISOString(),
    updatedBy: userEmail || 'admin@agueroflow.com',
  });
}

// ==========================================
// SUBSCRIÇÃO EM TEMPO REAL (FIRESTORE)
// ==========================================

export function subscribeCollectiveCategories(
  orgId: string,
  callback: (categories: CollectiveAssetCategory[]) => void
): () => void {
  const q = query(collection(db, 'collective_asset_categories'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CollectiveAssetCategory[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          orgId: d.orgId || orgId,
          name: d.name || '',
          description: d.description,
          preventiveMaintenanceIntervalMonths:
            d.preventiveMaintenanceIntervalMonths !== undefined
              ? d.preventiveMaintenanceIntervalMonths
              : d.preventiveMaintenancePeriodMonths,
          preventiveMaintenancePeriodMonths:
            d.preventiveMaintenancePeriodMonths !== undefined
              ? d.preventiveMaintenancePeriodMonths
              : d.preventiveMaintenanceIntervalMonths,
          calibrationIntervalMonths:
            d.calibrationIntervalMonths !== undefined
              ? d.calibrationIntervalMonths
              : d.calibrationPeriodMonths,
          calibrationPeriodMonths:
            d.calibrationPeriodMonths !== undefined
              ? d.calibrationPeriodMonths
              : d.calibrationIntervalMonths,
          warningDays: d.warningDays !== undefined ? d.warningDays : d.warningDaysBeforeExpiration ?? 30,
          warningDaysBeforeExpiration:
            d.warningDaysBeforeExpiration !== undefined ? d.warningDaysBeforeExpiration : d.warningDays ?? 30,
          active: d.active !== undefined ? d.active : d.isActive ?? true,
          isActive: d.isActive !== undefined ? d.isActive : d.active ?? true,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
        };
      });
      callback(items);
    },
    (err) => {
      console.warn('Erro ao assinar categorias de bens:', err);
      callback([]);
    }
  );
}

export function subscribeCollectiveAssets(
  orgId: string,
  callback: (assets: CollectiveAsset[]) => void
): () => void {
  const q = query(collection(db, 'collective_assets'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CollectiveAsset[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          orgId: d.orgId || orgId,
          unitId: d.unitId,
          code: d.code || '',
          description: d.description || '',
          categoryId: d.categoryId || '',
          categoryName: d.categoryName,
          brandModel: d.brandModel,
          serialNumber: d.serialNumber,
          storageLocation: d.storageLocation,
          condition: d.condition || 'ativo',
          overrideMaintenanceIntervalMonths: d.overrideMaintenanceIntervalMonths,
          overrideCalibrationIntervalMonths: d.overrideCalibrationIntervalMonths,
          notes: d.notes,
          attachments: d.attachments || [],
          isDemo: d.isDemo,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
          currentCheckout: d.currentCheckout || null,
        } as CollectiveAsset;
      });
      callback(items);
    },
    (err) => {
      console.warn('Erro ao assinar bens coletivos:', err);
      callback([]);
    }
  );
}

export function subscribeCollectiveWorkers(
  orgId: string,
  callback: (workers: CollectiveAssetWorker[]) => void
): () => void {
  const q = query(collection(db, 'collective_asset_workers'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CollectiveAssetWorker[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const reg = d.registrationNumber || d.registration || '';
        const dept = d.department || d.sector || '';
        const act = d.active !== undefined ? d.active : d.isActive ?? true;
        return {
          id: docSnap.id,
          orgId: d.orgId || orgId,
          registrationNumber: reg,
          registration: reg,
          name: d.name || '',
          department: dept,
          sector: dept,
          role: d.role || '',
          contactPhone: d.contactPhone,
          active: act,
          isActive: act,
          notes: d.notes,
          linkedUserId: d.linkedUserId,
          isDemo: d.isDemo,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
        };
      });
      callback(items);
    },
    (err) => {
      console.warn('Erro ao assinar colaboradores:', err);
      callback([]);
    }
  );
}

export function subscribeCollectiveMovements(
  orgId: string,
  callback: (movements: CollectiveAssetMovement[]) => void
): () => void {
  const q = query(collection(db, 'collective_asset_movements'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CollectiveAssetMovement[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          orgId: d.orgId || orgId,
          unitId: d.unitId,
          contractId: d.contractId,
          assetId: d.assetId,
          assetCode: d.assetCode,
          assetDescription: d.assetDescription,
          workerId: d.workerId,
          workerName: d.workerName,
          workerRegistration: d.workerRegistration,
          checkoutDate: d.checkoutDate,
          checkoutNotes: d.checkoutNotes,
          releasedBy: d.releasedBy,
          expectedReturnDate: d.expectedReturnDate,
          returnDate: d.returnDate,
          returnCondition: d.returnCondition,
          receivedBy: d.receivedBy,
          returnNotes: d.returnNotes,
          returnAttachments: d.returnAttachments || [],
          status: d.status || 'EM_USO',
          isDemo: d.isDemo,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
        };
      });
      callback(items);
    },
    (err) => {
      console.warn('Erro ao assinar movimentações de bens:', err);
      callback([]);
    }
  );
}

export function subscribeCollectiveServices(
  orgId: string,
  callback: (services: CollectiveAssetService[]) => void
): () => void {
  const q = query(collection(db, 'collective_asset_services'), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CollectiveAssetService[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          orgId: d.orgId || orgId,
          unitId: d.unitId,
          assetId: d.assetId,
          assetCode: d.assetCode,
          serviceDate: d.serviceDate,
          type: d.type || (d.serviceType as any) || 'manutencao_preventiva',
          performer: d.performer || d.performedBy || '',
          certificateOrOsNumber: d.certificateOrOsNumber || d.certificateOrOrderNumber,
          result: d.result || 'aprovado',
          notes: d.notes,
          attachments: d.attachments || (d.attachmentUrl ? [{ url: d.attachmentUrl, name: 'Anexo', uploadedAt: new Date().toISOString() }] : []),
          isDemo: d.isDemo,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
        };
      });
      callback(items);
    },
    (err) => {
      console.warn('Erro ao assinar serviços de bens:', err);
      callback([]);
    }
  );
}

// ==========================================
// POLÍTICAS DA ORGANIZAÇÃO
// ==========================================

export async function getCollectiveAssetPolicy(orgId: string): Promise<CollectiveAssetPolicy> {
  const policyRef = doc(db, 'collective_asset_policies', orgId);
  const snap = await getDoc(policyRef);
  if (snap.exists()) {
    const d = snap.data();
    const block = d.blockOnNoHistory !== undefined ? d.blockOnNoHistory : d.blockCheckoutOnMissingHistory ?? false;
    const warn = d.defaultWarningDays !== undefined ? d.defaultWarningDays : d.defaultWarningDaysBeforeExpiration ?? 30;
    return {
      orgId,
      organizationId: orgId,
      blockOnNoHistory: block,
      blockCheckoutOnMissingHistory: block,
      defaultWarningDays: warn,
      defaultWarningDaysBeforeExpiration: warn,
      updatedAt: d.updatedAt || new Date().toISOString(),
      updatedBy: d.updatedBy,
    };
  }
  return {
    orgId,
    organizationId: orgId,
    blockOnNoHistory: false,
    blockCheckoutOnMissingHistory: false,
    defaultWarningDays: 30,
    defaultWarningDaysBeforeExpiration: 30,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateCollectiveAssetPolicy(
  orgId: string,
  data: Partial<CollectiveAssetPolicy>
): Promise<void> {
  const policyRef = doc(db, 'collective_asset_policies', orgId);
  const block =
    data.blockOnNoHistory !== undefined
      ? data.blockOnNoHistory
      : data.blockCheckoutOnMissingHistory !== undefined
      ? data.blockCheckoutOnMissingHistory
      : false;
  const warn =
    data.defaultWarningDays !== undefined
      ? data.defaultWarningDays
      : data.defaultWarningDaysBeforeExpiration !== undefined
      ? data.defaultWarningDaysBeforeExpiration
      : 30;

  await setDoc(
    policyRef,
    {
      orgId,
      blockOnNoHistory: block,
      defaultWarningDays: warn,
      updatedAt: new Date().toISOString(),
      updatedBy: data.updatedBy || 'admin',
    },
    { merge: true }
  );
}

// ==========================================
// CRUD CATEGORIAS
// ==========================================

export async function createCollectiveCategory(
  data: any
): Promise<string> {
  const orgId = data.orgId || data.organizationId;
  const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const categoryData: CollectiveAssetCategory = {
    id,
    orgId,
    name: data.name,
    description: data.description,
    preventiveMaintenanceIntervalMonths:
      data.preventiveMaintenanceIntervalMonths !== undefined
        ? data.preventiveMaintenanceIntervalMonths
        : data.preventiveMaintenancePeriodMonths,
    calibrationIntervalMonths:
      data.calibrationIntervalMonths !== undefined
        ? data.calibrationIntervalMonths
        : data.calibrationPeriodMonths,
    warningDays: data.warningDays !== undefined ? data.warningDays : data.warningDaysBeforeExpiration ?? 30,
    active: data.active !== undefined ? data.active : data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'collective_asset_categories', id), categoryData);
  return id;
}

export async function updateCollectiveCategory(
  id: string,
  data: Partial<any>
): Promise<void> {
  const updates: any = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.preventiveMaintenanceIntervalMonths !== undefined)
    updates.preventiveMaintenanceIntervalMonths = data.preventiveMaintenanceIntervalMonths;
  if (data.preventiveMaintenancePeriodMonths !== undefined)
    updates.preventiveMaintenanceIntervalMonths = data.preventiveMaintenancePeriodMonths;
  if (data.calibrationIntervalMonths !== undefined)
    updates.calibrationIntervalMonths = data.calibrationIntervalMonths;
  if (data.calibrationPeriodMonths !== undefined)
    updates.calibrationIntervalMonths = data.calibrationPeriodMonths;
  if (data.warningDays !== undefined) updates.warningDays = data.warningDays;
  if (data.warningDaysBeforeExpiration !== undefined) updates.warningDays = data.warningDaysBeforeExpiration;
  if (data.active !== undefined) updates.active = data.active;
  if (data.isActive !== undefined) updates.active = data.isActive;

  await updateDoc(doc(db, 'collective_asset_categories', id), updates);
}

export async function toggleCategoryStatus(id: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'collective_asset_categories', id), {
    active,
    updatedAt: new Date().toISOString(),
  });
}

// ==========================================
// CRUD COLABORADORES
// ==========================================

export async function createCollectiveWorker(data: any): Promise<string> {
  const orgId = data.orgId || data.organizationId;
  const id = `wrk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const reg = data.registrationNumber || data.registration || '';
  const dept = data.department || data.sector || '';
  const workerData: CollectiveAssetWorker = {
    id,
    orgId,
    registrationNumber: reg,
    name: data.name,
    department: dept,
    role: data.role || 'Geral',
    contactPhone: data.contactPhone,
    active: data.active !== undefined ? data.active : data.isActive ?? true,
    notes: data.notes,
    linkedUserId: data.linkedUserId,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'collective_asset_workers', id), workerData);
  return id;
}

export async function updateCollectiveWorker(id: string, data: Partial<any>): Promise<void> {
  const updates: any = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.registrationNumber !== undefined) updates.registrationNumber = data.registrationNumber;
  if (data.registration !== undefined) updates.registrationNumber = data.registration;
  if (data.department !== undefined) updates.department = data.department;
  if (data.sector !== undefined) updates.department = data.sector;
  if (data.role !== undefined) updates.role = data.role;
  if (data.contactPhone !== undefined) updates.contactPhone = data.contactPhone;
  if (data.active !== undefined) updates.active = data.active;
  if (data.isActive !== undefined) updates.active = data.isActive;
  if (data.notes !== undefined) updates.notes = data.notes;

  await updateDoc(doc(db, 'collective_asset_workers', id), updates);
}

export async function toggleWorkerStatus(id: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'collective_asset_workers', id), {
    active,
    updatedAt: new Date().toISOString(),
  });
}

// ==========================================
// CRUD BENS COLETIVOS
// ==========================================

export async function createCollectiveAsset(data: any): Promise<string> {
  const orgId = data.orgId || data.organizationId;
  const id = `ast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const assetData: CollectiveAsset = {
    id,
    orgId,
    unitId: data.unitId,
    code: data.code.toUpperCase().trim(),
    description: data.description.trim(),
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    brandModel: data.brandModel,
    serialNumber: data.serialNumber,
    storageLocation: data.storageLocation,
    condition: data.condition || 'ativo',
    overrideMaintenanceIntervalMonths: data.overrideMaintenanceIntervalMonths,
    overrideCalibrationIntervalMonths: data.overrideCalibrationIntervalMonths,
    notes: data.notes,
    attachments: data.attachments || [],
    isDemo: data.isDemo ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'collective_assets', id), assetData);
  return id;
}

export async function updateCollectiveAsset(id: string, data: Partial<any>): Promise<void> {
  const updates: any = {
    updatedAt: new Date().toISOString(),
  };
  if (data.description !== undefined) updates.description = data.description;
  if (data.categoryId !== undefined) updates.categoryId = data.categoryId;
  if (data.categoryName !== undefined) updates.categoryName = data.categoryName;
  if (data.brandModel !== undefined) updates.brandModel = data.brandModel;
  if (data.serialNumber !== undefined) updates.serialNumber = data.serialNumber;
  if (data.storageLocation !== undefined) updates.storageLocation = data.storageLocation;
  if (data.condition !== undefined) updates.condition = data.condition;
  if (data.overrideMaintenanceIntervalMonths !== undefined)
    updates.overrideMaintenanceIntervalMonths = data.overrideMaintenanceIntervalMonths;
  if (data.overrideCalibrationIntervalMonths !== undefined)
    updates.overrideCalibrationIntervalMonths = data.overrideCalibrationIntervalMonths;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.attachments !== undefined) updates.attachments = data.attachments;

  await updateDoc(doc(db, 'collective_assets', id), updates);
}

