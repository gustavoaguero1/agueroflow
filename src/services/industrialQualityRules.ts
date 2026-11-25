import type { Asset } from '../types/index.ts';
import type {
  DataBookBlocker,
  MaterialLot,
  NdtMethod,
  NdtReport,
  ProjectDataBookReport,
  QualityItpMatrix,
  WeldJoint,
  WelderQualification,
  WeldingProcedure,
} from '../types/industrialQuality.ts';
import { evaluateAssetAvailability } from './assetAvailabilityRules.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateWeldJointPrerequisites(params: {
  orgId: string;
  weldDate: string;
  heatNumber: string;
  eps: WeldingProcedure | null;
  welderQualification: WelderQualification | null;
  materialLot?: MaterialLot | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { orgId, weldDate, heatNumber, eps, welderQualification, materialLot } = params;

  if (!ISO_DATE_RE.test(String(weldDate || '').trim())) {
    errors.push('Data da soldagem inválida (use YYYY-MM-DD).');
  }
  if (String(heatNumber || '').trim().length < 2) {
    errors.push('Informe o número de corrida metalúrgica (heat number) do material.');
  }
  if (!eps || eps.orgId !== orgId) {
    errors.push('Procedimento de soldagem (EPS/WPS) não encontrado nesta empresa.');
  } else if (eps.status !== 'ativa') {
    errors.push(`Procedimento ${eps.code} está obsoleto e não pode ser utilizado em novas juntas.`);
  }

  if (!welderQualification || welderQualification.orgId !== orgId) {
    errors.push('Qualificação/sinete do soldador não encontrada nesta empresa.');
  } else {
    if (welderQualification.status !== 'ativa') {
      errors.push(`Qualificação do soldador ${welderQualification.employeeName} (${welderQualification.stampCode}) não está ativa.`);
    }
    if (ISO_DATE_RE.test(welderQualification.qualifiedUntil) && ISO_DATE_RE.test(weldDate) && welderQualification.qualifiedUntil < weldDate) {
      errors.push(
        `Qualificação do soldador ${welderQualification.employeeName} (${welderQualification.stampCode}) venceu em ${welderQualification.qualifiedUntil}.`,
      );
    }
    if (eps && welderQualification.epsIds.length > 0 && !welderQualification.epsIds.includes(eps.id)) {
      errors.push(`Soldador ${welderQualification.stampCode} não está qualificado na EPS ${eps.code}.`);
    }
  }

  if (materialLot && materialLot.orgId !== orgId) {
    errors.push('Lote/corrida informado não pertence a esta empresa.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateNdtReportPrerequisites(params: {
  orgId: string;
  method: NdtMethod;
  inspectedAt: string;
  instrumentAsset: (Asset & { calibrationDueDate?: string }) | null;
  testPressureBar?: number;
  testFluid?: string;
  durationMinutes?: number;
  jointIds: readonly string[];
  circuitOrLine?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { orgId, method, inspectedAt, instrumentAsset, testPressureBar, testFluid, durationMinutes, jointIds, circuitOrLine } = params;

  if (!ISO_DATE_RE.test(String(inspectedAt || '').trim())) {
    errors.push('Data da inspeção END inválida (use YYYY-MM-DD).');
  }
  if (!instrumentAsset || instrumentAsset.orgId !== orgId) {
    errors.push('Instrumento de medição/ensaio não encontrado nesta empresa.');
  } else {
    const avail = evaluateAssetAvailability(instrumentAsset, `${inspectedAt}T12:00:00.000Z`);
    if (!avail.available) {
      errors.push(...avail.blockers);
    }
    if (!instrumentAsset.calibrationDueDate) {
      errors.push(`Instrumento ${instrumentAsset.tag || instrumentAsset.name} não possui data de validade de calibração cadastrada.`);
    }
  }

  if (method === 'hidrostatico' || method === 'pneumatico') {
    if (!circuitOrLine?.trim()) {
      errors.push('Informe o circuito ou trecho ensaiado para teste hidrostático/pneumático.');
    }
    if (!Number.isFinite(Number(testPressureBar)) || Number(testPressureBar) <= 0) {
      errors.push('Informe a pressão de teste (bar) maior que zero.');
    }
    if (!testFluid?.trim()) {
      errors.push('Informe o fluido de teste utilizado.');
    }
    if (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) <= 0) {
      errors.push('Informe a duração do teste em minutos.');
    }
  } else if (jointIds.length === 0 && !circuitOrLine?.trim()) {
    errors.push('Vincule ao menos uma junta soldada ou linha/spool ao laudo END.');
  }

  return { valid: errors.length === 0, errors };
}

export function traceHeatNumberApplications(params: {
  orgId: string;
  heatNumber: string;
  lots: readonly MaterialLot[];
  joints: readonly WeldJoint[];
}): {
  heatNumber: string;
  matchingLots: MaterialLot[];
  appliedOrderIds: string[];
  appliedJoints: WeldJoint[];
} {
  const target = String(params.heatNumber || '').trim().toUpperCase();
  const matchingLots = params.lots.filter(
    (l) => l.orgId === params.orgId && l.heatNumber.trim().toUpperCase() === target,
  );
  const lotIds = new Set(matchingLots.map((l) => l.id));
  const appliedJoints = params.joints.filter(
    (j) =>
      j.orgId === params.orgId &&
      (j.heatNumber.trim().toUpperCase() === target || (j.materialLotId ? lotIds.has(j.materialLotId) : false)),
  );
  const orderIds = new Set<string>();
  for (const l of matchingLots) {
    for (const oid of l.appliedOrderIds || []) if (oid) orderIds.add(oid);
  }
  for (const j of appliedJoints) {
    if (j.orderId) orderIds.add(j.orderId);
  }
  return {
    heatNumber: target,
    matchingLots,
    appliedOrderIds: Array.from(orderIds),
    appliedJoints,
  };
}

export function compileProjectDataBook(params: {
  orgId: string;
  projectId: string;
  weldJoints: readonly WeldJoint[];
  ndtReports: readonly NdtReport[];
  materialLots: readonly MaterialLot[];
  itpMatrices: readonly QualityItpMatrix[];
  engineeringDocs?: readonly Array<{ id: string; code?: string; status?: string; projectId?: string; contractId?: string }>[number][];
  qualityRecords?: readonly Array<{ id: string; recordType?: string; status?: string; code?: string }>[number][];
  nowIso?: string;
}): ProjectDataBookReport {
  const { orgId, projectId } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const joints = params.weldJoints.filter((j) => j.orgId === orgId && j.projectId === projectId);
  const ndts = params.ndtReports.filter((r) => r.orgId === orgId && r.projectId === projectId);
  const lots = params.materialLots.filter((l) => l.orgId === orgId && l.projectId === projectId);
  const itps = params.itpMatrices.filter((m) => m.orgId === orgId && m.projectId === projectId);
  const engDocs = params.engineeringDocs || [];
  const qualRecs = params.qualityRecords || [];

  const blockers: DataBookBlocker[] = [];

  for (const j of joints) {
    if (j.status !== 'aprovada') {
      blockers.push({
        category: 'solda',
        code: j.jointCode,
        message: `Junta ${j.jointCode} (${j.lineOrSpool}) ainda está em status "${j.status}".`,
        refId: j.id,
      });
    }
  }
  for (const r of ndts) {
    if (r.result !== 'aprovado') {
      blockers.push({
        category: 'end',
        code: r.reportCode,
        message: `Laudo ${r.method} ${r.reportCode} reprovado — exige reparo e novo ensaio.`,
        refId: r.id,
      });
    }
  }
  for (const l of lots) {
    if (!l.certificateNumber && !l.certificateStoragePath) {
      blockers.push({
        category: 'certificado',
        code: l.heatNumber,
        message: `Corrida ${l.heatNumber} (${l.itemName}) sem número ou arquivo de certificado de qualidade anexado.`,
        refId: l.id,
      });
    }
  }

  let itpHoldPointsTotal = 0;
  let itpHoldPointsReleased = 0;
  for (const itp of itps) {
    for (const step of itp.steps || []) {
      if (step.pointType === 'H') {
        itpHoldPointsTotal += 1;
        if (step.status === 'liberado') {
          itpHoldPointsReleased += 1;
        } else {
          blockers.push({
            category: 'itp',
            code: `${itp.code}#${step.stepNumber}`,
            message: `Ponto de espera (Hold) "${step.activity}" da ITP ${itp.code} está "${step.status}".`,
            refId: itp.id,
          });
        }
      }
    }
  }

  const engApproved = engDocs.filter((d) => d.status === 'aprovado' || d.status === 'as_built').length;
  for (const d of engDocs) {
    if (d.status && d.status !== 'aprovado' && d.status !== 'as_built') {
      blockers.push({
        category: 'engenharia',
        code: d.code || d.id,
        message: `Documento de engenharia ${d.code || d.id} ainda não aprovado/As Built (${d.status}).`,
        refId: d.id,
      });
    }
  }

  const openNcs = qualRecs.filter((q) => q.recordType === 'nao_conformidade' && q.status !== 'encerrado' && q.status !== 'aprovado');
  for (const nc of openNcs) {
    blockers.push({
      category: 'qualidade',
      code: nc.code || nc.id,
      message: `Não conformidade ${nc.code || nc.id} ainda em aberto (${nc.status || 'pendente'}).`,
      refId: nc.id,
    });
  }

  const weldJointsApproved = joints.filter((j) => j.status === 'aprovada').length;
  const ndtReportsApproved = ndts.filter((r) => r.result === 'aprovado').length;
  const materialLotsWithCertificate = lots.filter((l) => Boolean(l.certificateNumber || l.certificateStoragePath)).length;

  const totalChecks =
    joints.length + ndts.length + lots.length + itpHoldPointsTotal + engDocs.length + openNcs.length;
  const passedChecks =
    weldJointsApproved + ndtReportsApproved + materialLotsWithCertificate + itpHoldPointsReleased + engApproved;
  const completenessPercent = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return {
    projectId,
    orgId,
    generatedAt: nowIso,
    completenessPercent,
    readyForRelease: totalChecks > 0 && blockers.length === 0,
    counts: {
      engineeringDocsTotal: engDocs.length,
      engineeringDocsApproved: engApproved,
      weldJointsTotal: joints.length,
      weldJointsApproved,
      ndtReportsTotal: ndts.length,
      ndtReportsApproved,
      materialLotsTotal: lots.length,
      materialLotsWithCertificate,
      itpHoldPointsTotal,
      itpHoldPointsReleased,
      openQualityNcs: openNcs.length,
    },
    blockers,
  };
}
