// ============================================================================
// AGUEROFLOW — HOOK USEBUDGET18AREAS
// Centralized state manager for all 18 industrial budget sheets
// ============================================================================

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  CostComposition,
  CostCompositionItem,
  LaborRoleItem,
  CommissioningMemberItem,
  PersonnelExpenseItem,
  ThirdPartyServiceItem,
  ConsumableItem,
  MachineryEquipmentItem,
  SiteInfrastructureItem,
  MobDesmobItem,
  AdministrativeCostsItem,
  CostRiskItem,
  ProjectClassificationCriteria,
  TaxConfiguration,
  FinancialAndCommercialSettings,
  OperationalCostsSheet,
  SheetTabId,
} from '../types/costComposition';
import {
  Budget18AreasEngine,
  RecalculationResult,
  ValidationSummary,
  GeralReconciliationRow,
  GeralPriceBreakdown,
  AreaTotalSummary,
} from '../services/budget18AreasEngine';

export interface UseBudget18AreasReturn {
  comp: CostComposition;
  recalculation: RecalculationResult;
  reconciliationTable: GeralReconciliationRow[];
  priceBreakdown: GeralPriceBreakdown;
  areaSummaries: Record<SheetTabId, AreaTotalSummary>;
  validations: ValidationSummary;
  crossTabAlerts: string[];
  isDirty: boolean;
  resetDirty: () => void;

  // Mutators for each of the 18 areas with instant dependency propagation
  updateHeader: (updates: Partial<CostComposition>) => void;
  updateOperationalCosts: (updates: Partial<OperationalCostsSheet>) => void;
  updateLaborRole: (roleId: string, updates: Partial<LaborRoleItem>) => void;
  addLaborRole: (role: LaborRoleItem) => void;
  removeLaborRole: (roleId: string) => void;

  updateCommissioningMember: (memberId: string, updates: Partial<CommissioningMemberItem>) => void;
  addCommissioningMember: (member: CommissioningMemberItem) => void;
  removeCommissioningMember: (memberId: string) => void;

  updatePersonnelExpense: (expenseId: string, updates: Partial<PersonnelExpenseItem>) => void;
  addPersonnelExpense: (expense: PersonnelExpenseItem) => void;
  removePersonnelExpense: (expenseId: string) => void;

  updateThirdParty: (serviceId: string, updates: Partial<ThirdPartyServiceItem>) => void;
  addThirdParty: (service: ThirdPartyServiceItem) => void;
  removeThirdParty: (serviceId: string) => void;

  updateMaterial: (itemId: string, updates: Partial<CostCompositionItem>) => void;
  addMaterial: (item: CostCompositionItem) => void;
  removeMaterial: (itemId: string) => void;

  updateConsumable: (consumableId: string, updates: Partial<ConsumableItem>) => void;
  addConsumable: (consumable: ConsumableItem) => void;
  removeConsumable: (consumableId: string) => void;

  updateMachinery: (machineryId: string, updates: Partial<MachineryEquipmentItem>) => void;
  addMachinery: (machinery: MachineryEquipmentItem) => void;
  removeMachinery: (machineryId: string) => void;

  updateSiteInfra: (infraId: string, updates: Partial<SiteInfrastructureItem>) => void;
  addSiteInfra: (infra: SiteInfrastructureItem) => void;
  removeSiteInfra: (infraId: string) => void;

  updateMobDesmob: (mobId: string, updates: Partial<MobDesmobItem>) => void;
  addMobDesmob: (mob: MobDesmobItem) => void;
  removeMobDesmob: (mobId: string) => void;

  updateAdminCost: (adminId: string, updates: Partial<AdministrativeCostsItem>) => void;
  addAdminCost: (admin: AdministrativeCostsItem) => void;
  removeAdminCost: (adminId: string) => void;

  updateTaxConfig: (updates: Partial<TaxConfiguration>) => void;
  updateFinancialSettings: (updates: Partial<FinancialAndCommercialSettings>) => void;
  updateClassificationCriteria: (updates: Partial<ProjectClassificationCriteria>) => void;

  updateRisk: (riskId: string, updates: Partial<CostRiskItem>) => void;
  addRisk: (risk: CostRiskItem) => void;
  removeRisk: (riskId: string) => void;

  forceRecalculate: () => void;
}

export function useBudget18Areas(
  initialComposition: CostComposition,
  options?: {
    autoUpdateConsumables25Percent?: boolean;
    autoSyncAdminCosts?: boolean;
    autoSyncContingency?: boolean;
  }
): UseBudget18AreasReturn {
  const [comp, setComp] = useState<CostComposition>(() => {
    const res = Budget18AreasEngine.recalculateAll18Areas(initialComposition, options);
    return res.updatedComposition;
  });

  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Memoized recalculation across all 18 sheets
  const recalculation = useMemo(() => {
    return Budget18AreasEngine.recalculateAll18Areas(comp, options);
  }, [comp, options]);

  const applyUpdate = useCallback((mutator: (prev: CostComposition) => CostComposition) => {
    setComp((prev) => {
      const draft = mutator(JSON.parse(JSON.stringify(prev)));
      const recalculated = Budget18AreasEngine.recalculateAll18Areas(draft, options);
      return recalculated.updatedComposition;
    });
    setIsDirty(true);
  }, [options]);

  const resetDirty = useCallback(() => setIsDirty(false), []);

  // Mutators
  const updateHeader = useCallback((updates: Partial<CostComposition>) => {
    applyUpdate((draft) => ({ ...draft, ...updates }));
  }, [applyUpdate]);

  const updateOperationalCosts = useCallback((updates: Partial<OperationalCostsSheet>) => {
    applyUpdate((draft) => ({
      ...draft,
      operationalCosts: {
        ...(draft.operationalCosts || {
          averageHourlyCostRef: 41.21,
          depreciationMonthly: 2175,
          energyMonthlyCost: 1230,
          paintingSurfaceRatePerM2: 45,
          maintenanceRatePercent: 3.5,
          lines: [],
          subtotal: 0,
        }),
        ...updates,
      },
    }));
  }, [applyUpdate]);

  const updateLaborRole = useCallback((roleId: string, updates: Partial<LaborRoleItem>) => {
    applyUpdate((draft) => {
      draft.laborRoles = (draft.laborRoles || []).map((r) => (r.id === roleId ? { ...r, ...updates } : r));
      return draft;
    });
  }, [applyUpdate]);

  const addLaborRole = useCallback((role: LaborRoleItem) => {
    applyUpdate((draft) => {
      draft.laborRoles = [...(draft.laborRoles || []), role];
      return draft;
    });
  }, [applyUpdate]);

  const removeLaborRole = useCallback((roleId: string) => {
    applyUpdate((draft) => {
      draft.laborRoles = (draft.laborRoles || []).filter((r) => r.id !== roleId);
      return draft;
    });
  }, [applyUpdate]);

  const updateCommissioningMember = useCallback((memberId: string, updates: Partial<CommissioningMemberItem>) => {
    applyUpdate((draft) => {
      draft.commissioningMembers = (draft.commissioningMembers || []).map((m) => (m.id === memberId ? { ...m, ...updates } : m));
      return draft;
    });
  }, [applyUpdate]);

  const addCommissioningMember = useCallback((member: CommissioningMemberItem) => {
    applyUpdate((draft) => {
      draft.commissioningMembers = [...(draft.commissioningMembers || []), member];
      return draft;
    });
  }, [applyUpdate]);

  const removeCommissioningMember = useCallback((memberId: string) => {
    applyUpdate((draft) => {
      draft.commissioningMembers = (draft.commissioningMembers || []).filter((m) => m.id !== memberId);
      return draft;
    });
  }, [applyUpdate]);

  const updatePersonnelExpense = useCallback((expenseId: string, updates: Partial<PersonnelExpenseItem>) => {
    applyUpdate((draft) => {
      draft.personnelExpenses = (draft.personnelExpenses || []).map((e) => (e.id === expenseId ? { ...e, ...updates } : e));
      return draft;
    });
  }, [applyUpdate]);

  const addPersonnelExpense = useCallback((expense: PersonnelExpenseItem) => {
    applyUpdate((draft) => {
      draft.personnelExpenses = [...(draft.personnelExpenses || []), expense];
      return draft;
    });
  }, [applyUpdate]);

  const removePersonnelExpense = useCallback((expenseId: string) => {
    applyUpdate((draft) => {
      draft.personnelExpenses = (draft.personnelExpenses || []).filter((e) => e.id !== expenseId);
      return draft;
    });
  }, [applyUpdate]);

  const updateThirdParty = useCallback((serviceId: string, updates: Partial<ThirdPartyServiceItem>) => {
    applyUpdate((draft) => {
      draft.thirdPartyServices = (draft.thirdPartyServices || []).map((t) => (t.id === serviceId ? { ...t, ...updates } : t));
      return draft;
    });
  }, [applyUpdate]);

  const addThirdParty = useCallback((service: ThirdPartyServiceItem) => {
    applyUpdate((draft) => {
      draft.thirdPartyServices = [...(draft.thirdPartyServices || []), service];
      return draft;
    });
  }, [applyUpdate]);

  const removeThirdParty = useCallback((serviceId: string) => {
    applyUpdate((draft) => {
      draft.thirdPartyServices = (draft.thirdPartyServices || []).filter((t) => t.id !== serviceId);
      return draft;
    });
  }, [applyUpdate]);

  const updateMaterial = useCallback((itemId: string, updates: Partial<CostCompositionItem>) => {
    applyUpdate((draft) => {
      draft.items = (draft.items || []).map((i) => (i.id === itemId ? { ...i, ...updates } : i));
      return draft;
    });
  }, [applyUpdate]);

  const addMaterial = useCallback((item: CostCompositionItem) => {
    applyUpdate((draft) => {
      draft.items = [...(draft.items || []), item];
      return draft;
    });
  }, [applyUpdate]);

  const removeMaterial = useCallback((itemId: string) => {
    applyUpdate((draft) => {
      draft.items = (draft.items || []).filter((i) => i.id !== itemId);
      return draft;
    });
  }, [applyUpdate]);

  const updateConsumable = useCallback((consumableId: string, updates: Partial<ConsumableItem>) => {
    applyUpdate((draft) => {
      draft.consumables = (draft.consumables || []).map((c) => (c.id === consumableId ? { ...c, ...updates } : c));
      return draft;
    });
  }, [applyUpdate]);

  const addConsumable = useCallback((consumable: ConsumableItem) => {
    applyUpdate((draft) => {
      draft.consumables = [...(draft.consumables || []), consumable];
      return draft;
    });
  }, [applyUpdate]);

  const removeConsumable = useCallback((consumableId: string) => {
    applyUpdate((draft) => {
      draft.consumables = (draft.consumables || []).filter((c) => c.id !== consumableId);
      return draft;
    });
  }, [applyUpdate]);

  const updateMachinery = useCallback((machineryId: string, updates: Partial<MachineryEquipmentItem>) => {
    applyUpdate((draft) => {
      draft.machinery = (draft.machinery || []).map((m) => (m.id === machineryId ? { ...m, ...updates } : m));
      return draft;
    });
  }, [applyUpdate]);

  const addMachinery = useCallback((machinery: MachineryEquipmentItem) => {
    applyUpdate((draft) => {
      draft.machinery = [...(draft.machinery || []), machinery];
      return draft;
    });
  }, [applyUpdate]);

  const removeMachinery = useCallback((machineryId: string) => {
    applyUpdate((draft) => {
      draft.machinery = (draft.machinery || []).filter((m) => m.id !== machineryId);
      return draft;
    });
  }, [applyUpdate]);

  const updateSiteInfra = useCallback((infraId: string, updates: Partial<SiteInfrastructureItem>) => {
    applyUpdate((draft) => {
      draft.siteInfrastructure = (draft.siteInfrastructure || []).map((s) => (s.id === infraId ? { ...s, ...updates } : s));
      return draft;
    });
  }, [applyUpdate]);

  const addSiteInfra = useCallback((infra: SiteInfrastructureItem) => {
    applyUpdate((draft) => {
      draft.siteInfrastructure = [...(draft.siteInfrastructure || []), infra];
      return draft;
    });
  }, [applyUpdate]);

  const removeSiteInfra = useCallback((infraId: string) => {
    applyUpdate((draft) => {
      draft.siteInfrastructure = (draft.siteInfrastructure || []).filter((s) => s.id !== infraId);
      return draft;
    });
  }, [applyUpdate]);

  const updateMobDesmob = useCallback((mobId: string, updates: Partial<MobDesmobItem>) => {
    applyUpdate((draft) => {
      draft.mobDesmob = (draft.mobDesmob || []).map((m) => (m.id === mobId ? { ...m, ...updates } : m));
      return draft;
    });
  }, [applyUpdate]);

  const addMobDesmob = useCallback((mob: MobDesmobItem) => {
    applyUpdate((draft) => {
      draft.mobDesmob = [...(draft.mobDesmob || []), mob];
      return draft;
    });
  }, [applyUpdate]);

  const removeMobDesmob = useCallback((mobId: string) => {
    applyUpdate((draft) => {
      draft.mobDesmob = (draft.mobDesmob || []).filter((m) => m.id !== mobId);
      return draft;
    });
  }, [applyUpdate]);

  const updateAdminCost = useCallback((adminId: string, updates: Partial<AdministrativeCostsItem>) => {
    applyUpdate((draft) => {
      draft.adminCosts = (draft.adminCosts || []).map((a) => (a.id === adminId ? { ...a, ...updates } : a));
      return draft;
    });
  }, [applyUpdate]);

  const addAdminCost = useCallback((admin: AdministrativeCostsItem) => {
    applyUpdate((draft) => {
      draft.adminCosts = [...(draft.adminCosts || []), admin];
      return draft;
    });
  }, [applyUpdate]);

  const removeAdminCost = useCallback((adminId: string) => {
    applyUpdate((draft) => {
      draft.adminCosts = (draft.adminCosts || []).filter((a) => a.id !== adminId);
      return draft;
    });
  }, [applyUpdate]);

  const updateTaxConfig = useCallback((updates: Partial<TaxConfiguration>) => {
    applyUpdate((draft) => ({
      ...draft,
      taxConfig: { ...(draft.taxConfig || {}), ...updates } as TaxConfiguration,
    }));
  }, [applyUpdate]);

  const updateFinancialSettings = useCallback((updates: Partial<FinancialAndCommercialSettings>) => {
    applyUpdate((draft) => ({
      ...draft,
      financialSettings: { ...(draft.financialSettings || {}), ...updates } as FinancialAndCommercialSettings,
    }));
  }, [applyUpdate]);

  const updateClassificationCriteria = useCallback((updates: Partial<ProjectClassificationCriteria>) => {
    applyUpdate((draft) => ({
      ...draft,
      classificationCriteria: { ...(draft.classificationCriteria || {}), ...updates } as ProjectClassificationCriteria,
    }));
  }, [applyUpdate]);

  const updateRisk = useCallback((riskId: string, updates: Partial<CostRiskItem>) => {
    applyUpdate((draft) => {
      draft.risks = (draft.risks || []).map((r) => (r.id === riskId ? { ...r, ...updates } : r));
      return draft;
    });
  }, [applyUpdate]);

  const addRisk = useCallback((risk: CostRiskItem) => {
    applyUpdate((draft) => {
      draft.risks = [...(draft.risks || []), risk];
      return draft;
    });
  }, [applyUpdate]);

  const removeRisk = useCallback((riskId: string) => {
    applyUpdate((draft) => {
      draft.risks = (draft.risks || []).filter((r) => r.id !== riskId);
      return draft;
    });
  }, [applyUpdate]);

  const forceRecalculate = useCallback(() => {
    applyUpdate((draft) => draft);
  }, [applyUpdate]);

  return {
    comp,
    recalculation,
    reconciliationTable: recalculation.reconciliationTable,
    priceBreakdown: recalculation.priceBreakdown,
    areaSummaries: recalculation.areaSummaries,
    validations: recalculation.validations,
    crossTabAlerts: recalculation.crossTabAlerts,
    isDirty,
    resetDirty,

    updateHeader,
    updateOperationalCosts,
    updateLaborRole,
    addLaborRole,
    removeLaborRole,
    updateCommissioningMember,
    addCommissioningMember,
    removeCommissioningMember,
    updatePersonnelExpense,
    addPersonnelExpense,
    removePersonnelExpense,
    updateThirdParty,
    addThirdParty,
    removeThirdParty,
    updateMaterial,
    addMaterial,
    removeMaterial,
    updateConsumable,
    addConsumable,
    removeConsumable,
    updateMachinery,
    addMachinery,
    removeMachinery,
    updateSiteInfra,
    addSiteInfra,
    removeSiteInfra,
    updateMobDesmob,
    addMobDesmob,
    removeMobDesmob,
    updateAdminCost,
    addAdminCost,
    removeAdminCost,
    updateTaxConfig,
    updateFinancialSettings,
    updateClassificationCriteria,
    updateRisk,
    addRisk,
    removeRisk,
    forceRecalculate,
  };
}
