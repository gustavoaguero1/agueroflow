import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDerivedContractFromProposal,
  buildDerivedProjectFromProposal,
  buildFrozenBudgetBaselineFromProposal,
  validateProposalWinUnitId,
} from '../src/services/proposalBaselineRules';

test('validateProposalWinUnitId rejects empty or default_unit values', () => {
  assert.throws(() => validateProposalWinUnitId(''), /default_unit/i);
  assert.throws(() => validateProposalWinUnitId('default_unit'), /default_unit/i);
  assert.throws(() => validateProposalWinUnitId(null), /default_unit/i);
  assert.equal(validateProposalWinUnitId(' unit_planta_1 '), 'unit_planta_1');
});

test('buildFrozenBudgetBaselineFromProposal freezes direct cost, indirect cost and contracted revenue', () => {
  const baseline = buildFrozenBudgetBaselineFromProposal({
    proposal: {
      id: 'prop_99',
      code: 'PROP-2026-099',
      totalBaseCost: 42000.55,
      totalFreightCost: 1500.2,
      totalTaxCost: 3499.25,
      proposedTotal: 65000,
      currency: 'brl',
    },
    actorUid: 'u_com',
    actorName: 'Comercial',
    frozenAt: '2026-11-25T12:00:00.000Z',
  });

  assert.equal(baseline.version, 1);
  assert.equal(baseline.plannedMaterialCost, 42000.55);
  assert.equal(baseline.plannedIndirectCost, 4999.45);
  assert.equal(baseline.plannedDirectCost, 47000);
  assert.equal(baseline.contractedRevenue, 65000);
  assert.equal(baseline.currency, 'BRL');
  assert.equal(baseline.sourceProposalId, 'prop_99');
  assert.equal(baseline.sourceProposalCode, 'PROP-2026-099');
});

test('derived contract and project use deterministic IDs and preserve tenant/unit/contract links', () => {
  const now = '2026-11-25T12:00:00.000Z';
  const proposal = {
    id: 'prop_42',
    code: 'PROP-042',
    title: 'Montagem Linha Vapor',
    clientId: 'cli_1',
    clientName: 'Indústria Alfa',
    scopeDescription: 'Tubulação inox',
    totalBaseCost: 10000,
    totalFreightCost: 500,
    totalTaxCost: 500,
    proposedTotal: 18000,
  };
  const contract = buildDerivedContractFromProposal({ orgId: 'org_a', unitId: 'unit_a', proposal, now });
  assert.equal(contract.id, 'ct_prop_prop_42');
  assert.equal(contract.orgId, 'org_a');
  assert.deepEqual(contract.unitIds, ['unit_a']);
  assert.equal(contract.value, 18000);

  const baseline = buildFrozenBudgetBaselineFromProposal({
    proposal,
    actorUid: 'u_1',
    actorName: 'Gestor',
    frozenAt: now,
  });
  const project = buildDerivedProjectFromProposal({
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: contract.id,
    costCenterId: 'cc_1',
    proposal,
    budgetBaseline: baseline,
    actorUid: 'u_1',
    actorName: 'Gestor',
    now,
  });
  assert.equal(project.id, 'prj_prop_prop_42');
  assert.equal(project.code, 'OBRA-PROP-042');
  assert.equal(project.contractId, contract.id);
  assert.equal(project.unitId, 'unit_a');
  assert.equal(project.costCenterId, 'cc_1');
  assert.equal(project.budgetBaseline?.plannedDirectCost, 11000);
  assert.equal(project.budgetBaseline?.contractedRevenue, 18000);
});
