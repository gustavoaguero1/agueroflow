import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAgueroInoxBudget,
  calculatePainting,
  calculateProjectCategory1to5,
  calculateRiskEntry,
  calculateSheetRow,
  computeRoleHH,
  createDefaultAgueroInoxModel,
} from '../src/services/agueroInoxPricingEngine.ts';

test('calculadora de chapas reproduz exatamente o exemplo da planilha (288 kg, 18 m², R$ 9.216, R$ 11.980,80)', () => {
  const res = calculateSheetRow({
    id: 's1',
    description: 'Chapa Inox 316L 2mm',
    alloy: 'planilha_padrao',
    quantity: 6,
    thicknessMm: 2,
    widthM: 1.5,
    lengthM: 2,
    pricePerKg: 32,
    refaturamentoPercent: 30,
    icmsCreditPercent: 18,
  });
  assert.equal(res.areaOneFace, 18);
  assert.equal(res.totalWeightKg, 288);
  assert.equal(res.totalCost, 9216);
  assert.equal(res.sellPreTax, 11980.8);
  assert.equal(res.icmsCredit, 1658.88);
});

test('densidade de chapa varia conforme liga (Alumínio vs Aço Carbono vs Inox 304)', () => {
  const base = {
    id: 's',
    description: 'Chapa',
    quantity: 1,
    thicknessMm: 10,
    widthM: 1,
    lengthM: 1,
    pricePerKg: 10,
    refaturamentoPercent: 0,
    icmsCreditPercent: 0,
  };
  assert.equal(calculateSheetRow({ ...base, alloy: 'aluminio' }).totalWeightKg, 27);
  assert.equal(calculateSheetRow({ ...base, alloy: 'aco_carbono' }).totalWeightKg, 78.5);
  assert.equal(calculateSheetRow({ ...base, alloy: 'inox_304' }).totalWeightKg, 79.3);
});

test('calculadora de HH calcula custo por hora e venda por margem (não refaturamento)', () => {
  const res = computeRoleHH({
    id: 't1',
    roleName: 'Teste',
    salario: 5000,
    beneficios: 1500,
    encargos: 3000,
    epis: 180,
    horasDia: 8.8,
    diasMes: 22,
    margemComercialPercent: 30,
    hhCusto: 0,
    hhVenda: 0,
    useManualHH: false,
  });
  assert.equal(res.hhCusto, 50);
  // Margem 30% => 50 / 0.70 = 71.43 (diferente de refaturamento 30% = 65.00)
  assert.equal(res.hhVenda, 71.43);
});

test('classificação do projeto 1..5 aplica pesos 10, 20, 30, 40, 200 e detecta alçada de diretoria', () => {
  // 3 critérios na cat 1 (30 pts) + 1 critério na cat 2 (20 pts) => Cat 1
  const cat1 = calculateProjectCategory1to5(
    { clientScore: 1, locationScore: 1, complexityScore: 1, valueScoreAuto: false, manualValueScore: 2 },
    100_000,
  );
  assert.equal(cat1.scoresByCategory[1], 30);
  assert.equal(cat1.scoresByCategory[2], 20);
  assert.equal(cat1.finalCategory, 1);
  assert.equal(cat1.requiresDirectorApproval, false);

  // Qualquer critério na cat 5 (peso 200) vence e exige diretoria
  const cat5 = calculateProjectCategory1to5(
    { clientScore: 5, locationScore: 1, complexityScore: 1, valueScoreAuto: true, manualValueScore: 1 },
    150_000,
  );
  assert.equal(cat5.scoresByCategory[5], 200);
  assert.equal(cat5.finalCategory, 5);
  assert.equal(cat5.requiresDirectorApproval, true);
});

test('matriz de riscos calcula score 0-100 e contingência conforme estratégia', () => {
  const aceitar = calculateRiskEntry({
    id: 'r1',
    rootCause: 'Atraso liberação',
    effect: 'Horas paradas',
    costAtRisk: 50_000,
    probability: 6,
    impact: 8,
    strategy: 'aceitar',
    action: 'Monitorar',
    actionCost: 3000,
    residualProbability: 2,
    residualImpact: 4,
  });
  assert.equal(aceitar.scoreInitial, 48);
  assert.equal(aceitar.contingencyReserve, 24_000);
  assert.equal(aceitar.totalRiskImpact, 27_000);

  const mitigar = calculateRiskEntry({
    id: 'r2',
    rootCause: 'Chuva',
    effect: 'Parada solda',
    costAtRisk: 50_000,
    probability: 6,
    impact: 8,
    strategy: 'mitigar',
    action: 'Tenda',
    actionCost: 4000,
    residualProbability: 2,
    residualImpact: 5,
  });
  assert.equal(mitigar.scoreResidual, 10);
  assert.equal(mitigar.contingencyReserve, 5_000);
  assert.equal(mitigar.totalRiskImpact, 9_000);

  const transferir = calculateRiskEntry({
    ...mitigar,
    id: 'r3',
    rootCause: 'Seguro',
    effect: 'Sinistro',
    costAtRisk: 50_000,
    probability: 6,
    impact: 8,
    strategy: 'transferir',
    action: 'Apólice',
    actionCost: 2000,
    residualProbability: 1,
    residualImpact: 1,
  });
  assert.equal(transferir.contingencyReserve, 0);
  assert.equal(transferir.totalRiskImpact, 2_000);
});

test('pintura arredonda galões para cima com perda + reserva de 10%', () => {
  const res = calculatePainting({
    enabled: true,
    areaM2: 100,
    coats: 2,
    yieldM2PerGallon: 40,
    lossPercent: 10,
    reservePercent: 10,
    pricePerGallon: 200,
    refaturamentoPercent: 60,
  });
  // (100*2/40)=5 * 1.1 * 1.1 = 6.05 => ceil = 7 galões
  assert.equal(res.gallons, 7);
  assert.equal(res.totalCost, 1400);
  assert.equal(res.sellPreTax, 2240);
});

test('orçamento completo reconcilia Price Breakdown ao centavo, calcula adm por dentro, container com 2 fretes e desconto extra 0% válido', () => {
  const model = createDefaultAgueroInoxModel('2026-06-01');
  model.connections[0].unitCost = 200_000;
  model.connections[1].unitCost = 50_000;
  model.siteInfra.push({
    id: 'c1',
    group: 'estrutura',
    description: 'Container Almoxarifado 20 pés',
    isContainer: true,
    quantity: 2,
    months: 2,
    unitCost: 1500,
    freightPerTrip: 900,
  });
  model.conditions.extraClosingDiscountPercent = 0;

  const res = calculateAgueroInoxBudget(model);

  // Container: 2 * 2 meses * 1500 = 6000 + 2 containers * 2 fretes * 900 = 3600 => 9600
  const canteiroGroup = res.groups.find((g) => g.id === 'canteiro');
  assert.equal(canteiroGroup?.cost, 9600);

  // Adm por dentro: 3% (1% + 2%) => adminBase = totalDirectCost / 0.97
  assert.equal(res.adminBase, Math.round((res.totalDirectCost / 0.97 + Number.EPSILON) * 100) / 100);

  // Desconto extra 0% NUNCA zera o preço final (corrige bug da planilha)
  assert.ok(res.finalSellingPrice > 0);
  assert.equal(res.extraClosingDiscountAmount, 0);
  assert.equal(res.finalSellingPrice, res.priceBeforeExtraDiscount);

  // Price Breakdown reconciliado ao centavo (corrige divergência de R$ 4.536,08 da planilha)
  assert.equal(
    Math.round((res.breakdownMaterialsGross + res.breakdownServicesGross) * 100),
    Math.round(res.finalSellingPrice * 100),
  );

  // Divisores tributários Aguero Inox (0.8775 serviços / 0.7275 materiais)
  assert.equal(res.serviceDivisor, 0.8775);
  assert.equal(res.materialDivisor, 0.7275);
});
