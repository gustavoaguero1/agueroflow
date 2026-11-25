import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateProposalWinUnitId,
  buildFrozenBudgetBaselineFromProposal,
  buildDerivedContractFromProposal,
  buildDerivedProjectFromProposal,
} from '../src/services/proposalBaselineRules.ts';
import { validateWorkOrderCreateInput, buildWorkOrderAndCreationEvent } from '../src/services/workOrderCreateRules.ts';
import { evaluateWorkOrderSafetyGate } from '../src/services/workOrderSafetyGate.ts';
import { evaluateAssetAvailability } from '../src/services/assetAvailabilityRules.ts';
import { computeStockReservationSplit, buildShortageRequisition } from '../src/services/stockReservationRules.ts';
import {
  validateWeldJointPrerequisites,
  validateNdtReportPrerequisites,
  traceHeatNumberApplications,
  compileProjectDataBook,
} from '../src/services/industrialQualityRules.ts';
import { normalizeFabricationRouting, canShipFabricationOrder } from '../src/services/manufacturingRules.ts';
import { computeAssetReliabilityKpis } from '../src/services/cmmsRules.ts';
import {
  computeBulletinTotals,
  computeBulletinFinancialAdjustments,
  buildReceivableFromApprovedBulletin,
} from '../src/services/measurementRules.ts';
import { computeProjectResultReport, deriveProjectCostLedger } from '../src/services/projectCostLedger.ts';
import { computeProjectEac, computeProjectSCurve } from '../src/services/projectEacAndSCurve.ts';
import { evaluatePortalGrantAccess } from '../src/services/clientPortalRules.ts';
import { validateAiActionConfirmation, type AiActionProposal } from '../src/services/aiActionGuard.ts';
import { enqueueOfflineMutation, reconcileServerSyncResult } from '../src/services/offlineSyncQueue.ts';
import { protheusSyncDocId, reconcileProtheusSnapshot } from '../src/services/protheusSyncRules.ts';
import { computeDashboardDataCoverage } from '../src/services/dashboardCoverageRules.ts';

test('Jornada ponta a ponta completa (PR #58 Seção 9): Proposta -> Obra -> OS/SMS -> Estoque/RC -> Solda/END/DataBook -> Fabricação/CMMS -> Medição -> Protheus -> Resultado -> Portal/IA/Offline', () => {
  const orgId = 'org_industrial';
  const unitId = 'unit_planta_01';
  const nowIso = '2026-11-25T14:00:00.000Z';

  // PASSO 1: Proposta ganha gera Contrato, Projeto/Obra mestre, baseline congelado e OS inicial
  const proposal = {
    id: 'prop_e2e_1',
    organizationId: orgId,
    code: 'PROP-2026-100',
    title: 'Montagem Linha Sanitária Inox 316L',
    clientId: 'cli_1',
    clientName: 'Indústria Alimentícia Alfa',
    unitId,
    proposedTotal: 200000,
    totalBaseCost: 140000,
  };
  const validatedUnitId = validateProposalWinUnitId(proposal.unitId);
  const budgetBaseline = buildFrozenBudgetBaselineFromProposal({
    proposal,
    actorUid: 'u_com',
    actorName: 'Comercial',
    frozenAt: nowIso,
  });
  const contract = buildDerivedContractFromProposal({
    orgId,
    unitId: validatedUnitId,
    proposal,
    now: nowIso,
  });
  const project = buildDerivedProjectFromProposal({
    orgId,
    unitId: validatedUnitId,
    contractId: contract.id,
    proposal,
    budgetBaseline,
    actorUid: 'u_com',
    actorName: 'Comercial',
    now: nowIso,
  });
  const initialWoCheck = validateWorkOrderCreateInput({
    orgId,
    unitId: validatedUnitId,
    projectId: project.id,
    contractId: contract.id,
    title: `Mobilização ${proposal.title}`,
    orderType: 'instalacao',
    priority: 'media',
  });
  assert.equal(initialWoCheck.valid, true);
  const { order: initialWorkOrder } = buildWorkOrderAndCreationEvent({
    orderId: 'os_e2e_1',
    orgId,
    orderNumber: 'OS-2026-0100',
    statusId: 'aberto',
    statusName: 'Aberto',
    normalized: initialWoCheck.normalized!,
    actor: { uid: 'u_com', name: 'Comercial' },
    nowIso,
  });
  const won = { contract, project, workOrder: initialWorkOrder };
  assert.equal(won.project.unitId, unitId);
  assert.equal(won.project.budgetBaseline?.plannedDirectCost, 140000);
  assert.equal(won.workOrder.projectId, won.project.id);

  // PASSO 2 & 3: OS de risco com validação SMS (PT aprovada + NR-35 + EPI) e ativo calibrado
  const woCheck = validateWorkOrderCreateInput({
    orgId,
    unitId,
    projectId: won.project.id,
    contractId: won.contract.id,
    assetId: 'asset_tig_01',
    title: 'Soldagem de Spools em Altura',
    orderType: 'instalacao',
    priority: 'alta',
    requiresSafetyPermit: true,
    safetyPermitType: 'trabalho_em_altura',
    safetyPermitId: 'pt_01',
    assignedEmployeeIds: ['emp_soldador_1'],
  });
  assert.equal(woCheck.valid, true);
  const { order: riskOrder } = buildWorkOrderAndCreationEvent({
    orderId: 'os_e2e_risk',
    orgId,
    orderNumber: 'OS-2026-0101',
    statusId: 'aberto',
    statusName: 'Aberto',
    normalized: woCheck.normalized!,
    actor: { uid: 'u_ops', name: 'Supervisor' },
    nowIso,
  });
  assert.equal(
    evaluateAssetAvailability({ id: 'asset_tig_01', tag: 'TIG-01', name: 'Inversora TIG', status: 'operacional', calibrationDueDate: '2027-06-01' }, nowIso).available,
    true,
  );
  const gatePass = evaluateWorkOrderSafetyGate({
    order: riskOrder as any,
    permit: {
      id: 'pt_01',
      orgId,
      documentType: 'pt',
      relatedAprId: 'apr_01',
      permitCode: 'PT-2026-00000001',
      permitDate: '2026-11-25',
      permitType: 'trabalho_em_altura',
      unitId,
      contractId: won.contract.id,
      validFrom: '2026-11-25T08:00:00.000Z',
      validUntil: '2026-11-25T18:00:00.000Z',
      teamMembers: ['José Soldador'],
      teamMemberIds: ['emp_soldador_1'],
    } as any,
    permitState: {
      id: 'pt_01',
      orgId,
      unitId,
      contractId: won.contract.id,
      permitId: 'pt_01',
      status: 'approved',
      latestEventId: 'evt_pt_1',
      updatedByUid: 'u_ops',
      updatedByName: 'Supervisor',
      updatedAt: nowIso,
    } as any,
    compliance: {
      loading: false,
      employees: [{ id: 'emp_soldador_1', orgId, name: 'José Soldador', active: true } as any],
      ppeCatalog: [
        {
          id: 'ppe_cinto',
          orgId,
          name: 'Cinto Paraquedista',
          category: 'Cinto paraquedista',
          caNumber: 'CA-12345',
          caExpiresAt: '2027-12-31',
          requiredForPermitTypes: ['trabalho_em_altura'],
          active: true,
          createdByUid: 'u_ops',
        } as any,
      ],
      ppeMovements: [
        {
          id: 'pm1',
          orgId,
          employeeId: 'emp_soldador_1',
          employeeName: 'José Soldador',
          ppeId: 'ppe_cinto',
          ppeName: 'Cinto Paraquedista',
          eventType: 'entregue',
          movementDate: '2026-11-01',
          createdByUid: 'u_ops',
          createdAt: '2026-11-01T10:00:00.000Z',
        } as any,
      ],
      trainingCatalog: [],
      trainingRecords: [
        {
          id: 'trec_1',
          orgId,
          employeeId: 'emp_soldador_1',
          employeeName: 'José Soldador',
          trainingCode: 'NR-35',
          title: 'Trabalho em Altura',
          issueDate: '2026-01-10',
          expirationDate: '2027-01-10',
        } as any,
      ],
      legacyTrainingRecords: [],
    },
    nowIso,
  });
  assert.equal(gatePass.allowed, true);

  // PASSO 4 & 5: Reserva de estoque com falta -> RC automática -> lote com corrida metalúrgica
  const split = computeStockReservationSplit({
    physicalBalance: 30,
    existingActiveReservations: [],
    requestedQty: 50,
  });
  assert.equal(split.qtyToReserve, 30);
  assert.equal(split.shortageQty, 20);
  const rc = buildShortageRequisition({
    requisitionId: 'rc_e2e_1',
    requisitionCode: 'RC-2026-0101',
    orgId,
    projectId: won.project.id,
    workOrderId: riskOrder.id,
    workOrderNumber: riskOrder.orderNumber,
    item: { id: 'it_tubo', sku: 'TB-316L', name: 'Tubo Inox 316L', unitOfMeasure: 'M', unitCost: 300 },
    shortageQty: split.shortageQty,
    currentStock: split.availableBalance,
    neededByDate: '2026-12-01',
    actor: { uid: 'u_ops', name: 'Supervisor' },
    nowIso,
  });
  assert.equal(rc.items[0].quantity, 20);

  // PASSO 6 & 7: Solda + END calibrado + Corrida + Data Book + Fabricação + CMMS
  const eps = { id: 'eps_1', orgId, code: 'EPS-316L', title: 'TIG 316L', process: 'TIG' as const, baseMetal: '316L', fillerMetal: 'ER316L', revision: 'Rev 0', status: 'ativa' as const, createdByUid: 'u1', createdByName: 'Eng', createdAt: nowIso, updatedAt: nowIso };
  const qual = { id: 'wq_1', orgId, rhEmployeeId: 'emp_soldador_1', employeeName: 'José', stampCode: 'S-01', process: 'TIG' as const, epsIds: ['eps_1'], epsCodes: ['EPS-316L'], qualifiedAt: '2026-01-01', qualifiedUntil: '2027-01-01', status: 'ativa' as const, createdByUid: 'u1', createdByName: 'Eng', createdAt: nowIso, updatedAt: nowIso };
  assert.equal(validateWeldJointPrerequisites({ orgId, weldDate: '2026-11-25', heatNumber: 'H-316L-01', eps, welderQualification: qual }).valid, true);
  assert.equal(
    validateNdtReportPrerequisites({
      orgId,
      method: 'LP',
      inspectedAt: '2026-11-25',
      instrumentAsset: { id: 'a_lp', orgId, unitId, tag: 'LP-01', name: 'Kit LP', category: 'END', status: 'operacional', calibrationDueDate: '2027-05-01', createdAt: nowIso, updatedAt: nowIso },
      jointIds: ['j_1'],
    }).valid,
    true,
  );
  const lot = { id: 'lot_1', orgId, itemId: 'it_tubo', itemSku: 'TB-316L', itemName: 'Tubo 316L', lotCode: 'L-1', heatNumber: 'H-316L-01', certificateNumber: 'CERT-316L-99', projectId: won.project.id, receivedQuantity: 50, unitOfMeasure: 'M', appliedOrderIds: [riskOrder.id], appliedJointIds: ['j_1'], createdByUid: 'u1', createdByName: 'Almox', createdAt: nowIso, updatedAt: nowIso };
  const joint = { id: 'j_1', orgId, projectId: won.project.id, unitId, contractId: won.contract.id, orderId: riskOrder.id, lineOrSpool: 'SP-01', jointCode: 'J-01', materialLotId: lot.id, heatNumber: 'H-316L-01', baseMaterialSpec: '316L', epsId: eps.id, epsCode: eps.code, welderQualificationId: qual.id, welderEmployeeId: 'emp_soldador_1', welderName: 'José', welderStamp: 'S-01', weldDate: '2026-11-25', visualResult: 'aprovada' as const, ndtRequiredMethods: ['LP' as const], ndtReportIds: ['ndt_1'], status: 'aprovada' as const, createdByUid: 'u1', createdByName: 'Eng', createdAt: nowIso, updatedAt: nowIso };
  const ndt = { id: 'ndt_1', orgId, projectId: won.project.id, unitId, contractId: won.contract.id, reportCode: 'LP-001', method: 'LP' as const, jointIds: ['j_1'], instrumentAssetId: 'a_lp', instrumentTag: 'LP-01', acceptanceCriteria: 'ASME B31.3', result: 'aprovado' as const, inspectorName: 'Insp', inspectedAt: '2026-11-25', createdByUid: 'u1', createdByName: 'Eng', createdAt: nowIso };
  assert.equal(traceHeatNumberApplications({ orgId, heatNumber: 'H-316L-01', lots: [lot], joints: [joint] }).appliedJoints.length, 1);
  const databook = compileProjectDataBook({ orgId, projectId: won.project.id, weldJoints: [joint], ndtReports: [ndt], materialLots: [lot], itpMatrices: [] });
  assert.equal(databook.readyForRelease, true);

  const routing = normalizeFabricationRouting([
    { stage: 'corte', description: 'Corte', plannedHours: 2, status: 'concluida', actualHours: 2, goodQty: 10 },
    { stage: 'inspecao', description: 'END', plannedHours: 1, status: 'concluida', actualHours: 1, goodQty: 10 },
  ]);
  assert.equal(canShipFabricationOrder({ status: 'liberada_expedicao', routing }).allowed, true);
  assert.equal(computeAssetReliabilityKpis({ assetId: 'asset_tig_01', operatingWindowHours: 720, records: [] }).sufficientData, false);

  // PASSO 8 & 9: Medição v2 com retenção -> Título a Receber -> Reconciliação Protheus
  const bmTotals = computeBulletinTotals([{ description: 'Montagem Tubulação 316L', unit: 'M', measuredQuantity: 50, unitPrice: 2000 }]);
  const bmAdj = computeBulletinFinancialAdjustments({ totalApprovedAmount: bmTotals.totalApprovedAmount, retentionPercent: 5 });
  const bulletin = {
    id: 'bm_e2e_1',
    orgId,
    code: 'BM-2026-001',
    number: 1,
    title: '1ª Medição',
    contractId: won.contract.id,
    projectId: won.project.id,
    unitId,
    clientName: 'Indústria Alimentícia Alfa',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-25',
    dueDate: '2026-12-25',
    status: 'aprovado' as const,
    ...bmTotals,
    ...bmAdj,
    createdByUid: 'u_ops',
    createdByName: 'Eng',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const receivable = buildReceivableFromApprovedBulletin(bulletin, 'u_fin', nowIso);
  assert.equal(receivable.valor, 95000); // 100.000 - 5% retenção

  const syncId = protheusSyncDocId(orgId, 'finance_receivable', receivable.id);
  const reconciled = reconcileProtheusSnapshot({
    existing: { id: syncId, orgId, entityType: 'finance_receivable', internalId: receivable.id, internalCode: bulletin.code, internalAmount: 95000, internalStatus: 'aberto', status: 'pendente_exportacao', attempts: 0, createdAt: nowIso, updatedAt: nowIso },
    protheusExternalId: 'E1-000100',
    protheusAmount: 95000,
    protheusStatus: 'aberto',
    nowIso,
  });
  assert.equal(reconciled.status, 'sincronizado');

  // PASSO 10: Resultado por Obra, EAC, Curva S, Cobertura, Portal Externo, IA Confirmada e Offline Queue
  const costLedgerInputs = {
    orgId,
    projects: [won.project],
    workOrders: [won.workOrder, riskOrder],
    timeLogs: [{ id: 'tl_1', orgId, projectId: won.project.id, totalHours: 100, hourlyRate: 150 } as any],
    stockMovements: [{ id: 'sm_1', orgId, unitId, projectId: won.project.id, type: 'saida', quantity: 30, unitCost: 300, totalCost: 9000, createdAt: nowIso } as any],
    purchaseOrders: [{ id: 'po_1', organizationId: orgId, projectId: won.project.id, status: 'emitida', totalValue: 6000 } as any],
  };
  const resultReport = computeProjectResultReport(costLedgerInputs);
  const derivedLedger = deriveProjectCostLedger(costLedgerInputs);
  assert.equal(resultReport.rows[0].realizedTotalCost, 24000); // 15000 HH + 9000 Estoque
  assert.equal(resultReport.rows[0].committedCost, 6000);

  const eac = computeProjectEac({ projectId: won.project.id, baselineBudget: 140000, committedOpen: 6000, realizedToDate: 24000, physicalProgressPct: 20 });
  assert.equal(eac.methodUsed, 'cpi_avanco_fisico');

  const sCurve = computeProjectSCurve({ project: won.project, realizedFacts: derivedLedger.facts, approvedBulletins: [bulletin] });
  assert.ok(sCurve.length >= 1);

  const coverage = computeDashboardDataCoverage({
    orgId,
    projects: [won.project],
    workOrders: [won.workOrder, riskOrder],
    bulletins: [bulletin],
    receivables: [receivable],
  });
  assert.equal(coverage.economic.aprovadoMedicao, 100000);
  assert.equal(coverage.economic.faturadoReceber, 95000);

  // Portal externo isolado: aprova escopo autorizado e bloqueia escopo não liberado / revogado
  const portalGrant = {
    id: 'cpg_1',
    orgId,
    clientName: 'Cliente Alfa',
    contractId: won.contract.id,
    projectId: won.project.id,
    scopes: ['schedule', 'databook'] as any,
    tokenHash: 'hash',
    expiresAt: '2027-01-01T00:00:00Z',
    createdByUid: 'u1',
    createdByName: 'Admin',
    createdAt: nowIso,
  };
  assert.equal(evaluatePortalGrantAccess({ grant: portalGrant, requiredScope: 'databook', nowIso }).allowed, true);
  assert.equal(evaluatePortalGrantAccess({ grant: portalGrant, requiredScope: 'measurements', nowIso }).allowed, false);
  assert.equal(evaluatePortalGrantAccess({ grant: { ...portalGrant, revokedAt: nowIso }, requiredScope: 'databook', nowIso }).allowed, false);

  // IA com confirmação humana obrigatória
  const aiProp: AiActionProposal = {
    id: 'aia_1',
    orgId,
    actionType: 'create_work_order_draft',
    summary: 'Criar OS de inspeção final',
    payload: { title: 'Inspeção final' },
    idempotencyKey: 'k_ai_1',
    status: 'aguardando_confirmacao',
    proposedByUid: 'u_ops',
    proposedByName: 'Sup',
    proposedAt: nowIso,
    expiresAt: '2026-11-25T15:00:00.000Z',
  };
  assert.equal(
    validateAiActionConfirmation({ proposal: aiProp, actorUid: 'u_ops', actorOrgId: orgId, actorRole: 'Supervisor', actorAreaLevel: 2, explicitConfirmation: false, nowIso }).allowed,
    false,
  );
  assert.equal(
    validateAiActionConfirmation({ proposal: aiProp, actorUid: 'u_ops', actorOrgId: orgId, actorRole: 'Supervisor', actorAreaLevel: 2, explicitConfirmation: true, nowIso }).allowed,
    true,
  );

  // Fila offline idempotente e detecção de conflito 409
  const q1 = enqueueOfflineMutation([], { id: 'm1', idempotencyKey: 'off_1', orgId, entityType: 'rdo_entry', entityId: 'rdo_1', payload: { text: 'Campo' }, createdAt: nowIso });
  const q2 = enqueueOfflineMutation(q1, { id: 'm2', idempotencyKey: 'off_1', orgId, entityType: 'rdo_entry', entityId: 'rdo_1', payload: { text: 'Campo' }, createdAt: nowIso });
  assert.equal(q2.length, 1);
  const conflict = reconcileServerSyncResult({ item: q2[0], serverStatus: 409, serverVersion: 'v2', nowIso });
  assert.equal(conflict.status, 'conflito');
});
