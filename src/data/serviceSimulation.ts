import { servicePlans } from './servicePlans.ts';

export type ServicePlanId = typeof servicePlans[number]['id'];
export type SimulationInput = {
  planId: ServicePlanId;
  students: number;
  shuttles: number;
  avgTuition: number;
  minutesPerStudent: number;
  hoursPerShuttle: number;
  hourlyValue: number;
  recoveryPercent: number;
};

export const simulationDefaults: SimulationInput = {
  planId: 'pro', students: 50, shuttles: 2, avgTuition: 180000,
  minutesPerStudent: 27, hoursPerShuttle: 12, hourlyValue: 12000, recoveryPercent: 0,
};

export function calculateServiceSimulation(input: SimulationInput) {
  const plan = servicePlans.find(plan => plan.id === input.planId);
  if (!plan || Object.entries(input).some(([key, value]) => key !== 'planId' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) || input.students < 1 || input.recoveryPercent > 100) {
    throw new Error('SIMULATION_INPUT_INVALID');
  }
  const vatAmount = Math.round(plan.monthlyPrice * 0.1);
  const monthlyCostIncludingVat = plan.monthlyPrice + vatAmount;
  const savedHours = input.students * input.minutesPerStudent / 60 + input.shuttles * input.hoursPerShuttle;
  const timeValue = Math.round(savedHours * input.hourlyValue);
  const recoveredAmount = Math.round(input.students * input.avgTuition * input.recoveryPercent / 100);
  const monthlyNetValue = timeValue + recoveredAmount - monthlyCostIncludingVat;
  return { monthlyCost: plan.monthlyPrice, vatAmount, monthlyCostIncludingVat, savedHours, timeValue, recoveredAmount, monthlyNetValue, annualNetValue: monthlyNetValue * 12 };
}
