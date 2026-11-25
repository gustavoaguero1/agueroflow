import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileProjectDataBook,
  traceHeatNumberApplications,
  validateNdtReportPrerequisites,
  validateWeldJointPrerequisites,
} from '../src/services/industrialQualityRules.ts';
import type { MaterialLot, NdtReport, QualityItpMatrix, WeldJoint, WelderQualification, WeldingProcedure } from '../src/types/industrialQuality.ts';

const activeEps: WeldingProcedure = {
  id: 'eps_1',
  orgId: 'org_a',
  code: 'EPS-316L-01',
  title: 'Solda TIG Tubulação Sanitária 316L',
  process: 'TIG',
  baseMetal: 'AISI 316L',
  fillerMetal: 'ER316L',
  revision: 'Rev 0',
  status: 'ativa',
  createdByUid: 'u1',
  createdByName: 'Eng',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const validWelder: WelderQualification = {
  id: 'wq_1',
  orgId: 'org_a',
  rhEmployeeId: 'emp_1',
  employeeName: 'José Soldador',
  stampCode: 'S-01',
  process: 'TIG',
  epsIds: ['eps_1'],
  epsCodes: ['EPS-316L-01'],
  qualifiedAt: '2026-01-01',
  qualifiedUntil: '2027-01-01',
  status: 'ativa',
  createdByUid: 'u1',
  createdByName: 'Eng',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

test('validateWeldJointPrerequisites aprova junta com EPS ativa, soldador vigente e corrida válida', () => {
  const res = validateWeldJointPrerequisites({
    orgId: 'org_a',
    weldDate: '2026-11-25',
    heatNumber: 'CORR-316L-998',
    eps: activeEps,
    welderQualification: validWelder,
  });
  assert.equal(res.valid, true);
});

test('validateWeldJointPrerequisites bloqueia soldador vencido, EPS obsoleta e EPS não qualificada', () => {
  const expired = validateWeldJointPrerequisites({
    orgId: 'org_a',
    weldDate: '2026-11-25',
    heatNumber: 'CORR-1',
    eps: { ...activeEps, status: 'obsoleta' },
    welderQualification: { ...validWelder, qualifiedUntil: '2026-10-01', epsIds: ['eps_other'] },
  });
  assert.equal(expired.valid, false);
  assert.ok(expired.errors.some((e) => e.includes('obsoleto')));
  assert.ok(expired.errors.some((e) => e.includes('venceu')));
  assert.ok(expired.errors.some((e) => e.includes('não está qualificado')));
});

test('validateNdtReportPrerequisites bloqueia instrumento com calibração vencida e exige parâmetros hidrostáticos', () => {
  const badCal = validateNdtReportPrerequisites({
    orgId: 'org_a',
    method: 'LP',
    inspectedAt: '2026-11-25',
    instrumentAsset: { id: 'a1', orgId: 'org_a', unitId: 'u1', tag: 'US-01', name: 'Ultrassom', category: 'END', status: 'operacional', calibrationDueDate: '2026-10-15', createdAt: '', updatedAt: '' },
    jointIds: ['j1'],
  });
  assert.equal(badCal.valid, false);
  assert.ok(badCal.errors.some((e) => e.includes('calibração vencida')));

  const badHydro = validateNdtReportPrerequisites({
    orgId: 'org_a',
    method: 'hidrostatico',
    inspectedAt: '2026-11-25',
    instrumentAsset: { id: 'a2', orgId: 'org_a', unitId: 'u1', tag: 'MAN-01', name: 'Manômetro', category: 'END', status: 'operacional', calibrationDueDate: '2027-06-01', createdAt: '', updatedAt: '' },
    jointIds: [],
  });
  assert.equal(badHydro.valid, false);
  assert.ok(badHydro.errors.some((e) => e.includes('pressão')));
});

test('traceHeatNumberApplications e compileProjectDataBook consolidam rastreabilidade e bloqueios do dossiê', () => {
  const lot: MaterialLot = {
    id: 'lot_1',
    orgId: 'org_a',
    itemId: 'it_1',
    itemSku: 'TUB-316L',
    itemName: 'Tubo Inox 316L',
    lotCode: 'L-01',
    heatNumber: 'H-7788',
    projectId: 'proj_1',
    receivedQuantity: 50,
    unitOfMeasure: 'M',
    appliedOrderIds: ['os_1'],
    appliedJointIds: ['j_1'],
    createdByUid: 'u1',
    createdByName: 'Almox',
    createdAt: '',
    updatedAt: '',
  };
  const joint: WeldJoint = {
    id: 'j_1',
    orgId: 'org_a',
    projectId: 'proj_1',
    unitId: 'u1',
    contractId: 'c1',
    orderId: 'os_1',
    lineOrSpool: 'L-01-SP01',
    jointCode: 'J-01',
    materialLotId: 'lot_1',
    heatNumber: 'H-7788',
    baseMaterialSpec: 'AISI 316L',
    epsId: 'eps_1',
    epsCode: 'EPS-316L-01',
    welderQualificationId: 'wq_1',
    welderEmployeeId: 'emp_1',
    welderName: 'José',
    welderStamp: 'S-01',
    weldDate: '2026-11-25',
    visualResult: 'aprovada',
    ndtRequiredMethods: ['LP'],
    ndtReportIds: ['ndt_1'],
    status: 'aprovada',
    createdByUid: 'u1',
    createdByName: 'Eng',
    createdAt: '',
    updatedAt: '',
  };
  const ndt: NdtReport = {
    id: 'ndt_1',
    orgId: 'org_a',
    projectId: 'proj_1',
    unitId: 'u1',
    contractId: 'c1',
    reportCode: 'LP-001',
    method: 'LP',
    jointIds: ['j_1'],
    instrumentAssetId: 'a2',
    instrumentTag: 'MAN-01',
    acceptanceCriteria: 'ASME B31.3',
    result: 'aprovado',
    inspectorName: 'Inspetor N2',
    inspectedAt: '2026-11-25',
    createdByUid: 'u1',
    createdByName: 'Eng',
    createdAt: '',
  };
  const itp: QualityItpMatrix = {
    id: 'itp_1',
    orgId: 'org_a',
    projectId: 'proj_1',
    contractId: 'c1',
    code: 'ITP-001',
    title: 'Montagem Sanitária',
    revision: 'Rev 0',
    steps: [
      { id: 's1', stepNumber: '1', activity: 'Recebimento de Tubos', discipline: 'Tubulação', acceptanceCriteria: 'Certificado 3.1', pointType: 'H', status: 'pendente' },
    ],
    createdByUid: 'u1',
    createdByName: 'Eng',
    createdAt: '',
    updatedAt: '',
  };

  const trace = traceHeatNumberApplications({ orgId: 'org_a', heatNumber: 'h-7788', lots: [lot], joints: [joint] });
  assert.equal(trace.matchingLots.length, 1);
  assert.deepEqual(trace.appliedOrderIds, ['os_1']);
  assert.equal(trace.appliedJoints.length, 1);

  const dbReport = compileProjectDataBook({
    orgId: 'org_a',
    projectId: 'proj_1',
    weldJoints: [joint],
    ndtReports: [ndt],
    materialLots: [lot],
    itpMatrices: [itp],
  });
  assert.equal(dbReport.readyForRelease, false);
  // Missing material certificate + pending ITP Hold point -> 2 blockers
  assert.equal(dbReport.blockers.length, 2);
  assert.equal(dbReport.counts.weldJointsApproved, 1);
  assert.equal(dbReport.counts.ndtReportsApproved, 1);
});
