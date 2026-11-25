import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAssemblyProductivity,
  evaluatePurchasingApprovalAuthority,
  evaluateSupplierScorecard,
} from '../src/services/productivityAndPurchasingRules.ts';

test('computeAssemblyProductivity calcula HH real por unidade e índice de eficiência', () => {
  const res = computeAssemblyProductivity({
    benchmark: { discipline: 'Tubulação Inox', unit: 'm', plannedHhPerUnit: 2.5, sourceLabel: 'Baseline Rev 1', revision: 'Rev 1' },
    plannedQuantity: 100,
    actualQuantity: 50,
    actualHours: 100, // 2.0 HH/m -> melhor que 2.5
  });
  assert.equal(res.actualHhPerUnit, 2);
  assert.equal(res.efficiencyIndex, 1.25);
  assert.equal(res.status, 'acima_meta');

  const empty = computeAssemblyProductivity({
    benchmark: { discipline: 'Solda', unit: 'junta', plannedHhPerUnit: 1.5, sourceLabel: 'Tabela', revision: 'Rev 0' },
    plannedQuantity: 20,
    actualQuantity: 0,
    actualHours: 0,
  });
  assert.equal(empty.status, 'dados_insuficientes');
  assert.equal(empty.actualHhPerUnit, null);
});

test('evaluateSupplierScorecard exige histórico real de recebimentos e mede prazo + conformidade', () => {
  const noData = evaluateSupplierScorecard({ supplierId: 'sup_1', supplierName: 'Fornecedor X', orders: [], receipts: [] });
  assert.equal(noData.compositeScore, null);

  const scored = evaluateSupplierScorecard({
    supplierId: 'sup_1',
    supplierName: 'Fornecedor X',
    orders: [
      { id: 'po_1', supplierId: 'sup_1', status: 'recebida_total', expectedDeliveryDate: '2026-11-20' } as any,
      { id: 'po_2', supplierId: 'sup_1', status: 'recebida_total', expectedDeliveryDate: '2026-11-10' } as any,
    ],
    receipts: [
      { id: 'rec_1', purchaseOrderId: 'po_1', receivedAt: '2026-11-19', items: [{ receivedQty: 10, nonConformingQty: 0 }] } as any,
      { id: 'rec_2', purchaseOrderId: 'po_2', receivedAt: '2026-11-15', items: [{ receivedQty: 10, nonConformingQty: 2 }] } as any,
    ],
  });
  assert.equal(scored.onTimeRatePct, 50);
  assert.equal(scored.qualityConformityPct, 90);
  assert.equal(scored.compositeScore, 70);
});

test('evaluatePurchasingApprovalAuthority aplica alçada configurada por valor e perfil', () => {
  const rules = [
    { id: 'r1', orgId: 'org_a', minAmount: 0, maxAmount: 5000, requiredRoles: ['Supervisor', 'Gerente', 'Admin'] as any, label: 'Alçada Nível 1' },
    { id: 'r2', orgId: 'org_a', minAmount: 5000.01, maxAmount: null, requiredRoles: ['Admin'] as any, label: 'Diretoria' },
  ];
  assert.equal(evaluatePurchasingApprovalAuthority({ amount: 3000, actorRole: 'Supervisor', rules }).allowed, true);
  assert.equal(evaluatePurchasingApprovalAuthority({ amount: 15000, actorRole: 'Gerente', rules }).allowed, false);
  assert.equal(evaluatePurchasingApprovalAuthority({ amount: 15000, actorRole: 'Admin', rules }).allowed, true);
});
