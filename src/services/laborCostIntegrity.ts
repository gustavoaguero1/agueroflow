export interface LaborCostCalculationInput {
  logHourlyRate?: number | null;
  workerHourlyRate?: number | null;
  normalHours?: number;
  overtime50Hours?: number;
  overtime100Hours?: number;
  travelHours?: number;
  nightShiftHours?: number;
  mealAllowance?: number;
  lodgingAllowance?: number;
  otherExpenses?: number;
  overtime50Multiplier?: number;
  overtime100Multiplier?: number;
  travelHourMultiplier?: number;
  nightShiftBonusPercent?: number;
  recordedTotal?: number;
}

export interface LaborCostCalculation {
  hourlyRate: number | null;
  baseSalaryCost: number;
  overtime50Cost: number;
  overtime100Cost: number;
  travelCost: number;
  nightShiftCost: number;
  allowancesCost: number;
  totalLaborCost: number;
  totalHours: number;
  unpricedHours: number;
  unclassifiedRecordedCost: number;
  hasMissingHourlyRate: boolean;
}

function positiveRate(value: unknown): number | null {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function hours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function multiplier(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value !== null && Number.isFinite(parsed) ? parsed : fallback;
}

/** Uses only a recorded hourly rate, a valid employee rate, or a saved cost snapshot. */
export function calculateLaborCost(input: LaborCostCalculationInput): LaborCostCalculation {
  const hourlyRate = positiveRate(input.logHourlyRate) ?? positiveRate(input.workerHourlyRate);
  const normalHours = hours(input.normalHours);
  const overtime50Hours = hours(input.overtime50Hours);
  const overtime100Hours = hours(input.overtime100Hours);
  const travelHours = hours(input.travelHours);
  const nightShiftHours = hours(input.nightShiftHours);
  const totalHours = normalHours + overtime50Hours + overtime100Hours + travelHours + nightShiftHours;
  const allowancesCost = amount(input.mealAllowance) + amount(input.lodgingAllowance) + amount(input.otherExpenses);
  const recordedTotal = amount(input.recordedTotal);
  const hasMissingHourlyRate = hourlyRate === null && totalHours > 0;

  if (hourlyRate === null) {
    return {
      hourlyRate: null,
      baseSalaryCost: 0,
      overtime50Cost: 0,
      overtime100Cost: 0,
      travelCost: 0,
      nightShiftCost: 0,
      allowancesCost,
      totalLaborCost: recordedTotal > 0 ? recordedTotal : allowancesCost,
      totalHours,
      unpricedHours: totalHours,
      unclassifiedRecordedCost: Math.max(0, recordedTotal - allowancesCost),
      hasMissingHourlyRate,
    };
  }

  const baseSalaryCost = normalHours * hourlyRate;
  const overtime50Cost = overtime50Hours * hourlyRate * multiplier(input.overtime50Multiplier, 1.5);
  const overtime100Cost = overtime100Hours * hourlyRate * multiplier(input.overtime100Multiplier, 2);
  const travelCost = travelHours * hourlyRate * multiplier(input.travelHourMultiplier, 1);
  const nightShiftCost = nightShiftHours * hourlyRate * (multiplier(input.nightShiftBonusPercent, 20) / 100);
  const calculatedTotal = baseSalaryCost + overtime50Cost + overtime100Cost + travelCost + nightShiftCost + allowancesCost;

  return {
    hourlyRate,
    baseSalaryCost,
    overtime50Cost,
    overtime100Cost,
    travelCost,
    nightShiftCost,
    allowancesCost,
    totalLaborCost: recordedTotal > 0 ? recordedTotal : calculatedTotal,
    totalHours,
    unpricedHours: 0,
    unclassifiedRecordedCost: 0,
    hasMissingHourlyRate: false,
  };
}
