import { RISK_CONFIG } from "../config";

export type RiskInput = {
  dc: number;
  alertCount: number;
  hotspotCount: number;
  peatFrac: number;
};

export type RiskBreakdown = {
  risk: number;
  dry: number;
  clear: number;
  hot: number;
  peatFactor: number;
  dryContribution: number;
  clearContribution: number;
  hotContribution: number;
  synergyContribution: number;
  synergyApplied: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function calculateRisk(input: RiskInput): RiskBreakdown {
  if (
    ![input.dc, input.alertCount, input.hotspotCount, input.peatFrac].every(
      Number.isFinite,
    ) ||
    input.dc < 0 ||
    input.alertCount < 0 ||
    input.hotspotCount < 0 ||
    input.peatFrac < 0 ||
    input.peatFrac > 1
  ) {
    throw new Error("Risk inputs must be finite counts and peatFrac between 0 and 1");
  }

  const dry = clamp(
    (input.dc - RISK_CONFIG.dcMin) / (RISK_CONFIG.dcMax - RISK_CONFIG.dcMin),
    0,
    1,
  );
  const clear = Math.min(1, input.alertCount / RISK_CONFIG.maxAlerts);
  const hot = Math.min(1, input.hotspotCount / RISK_CONFIG.maxHotspots);
  const peatFactor =
    RISK_CONFIG.peatBase + RISK_CONFIG.peatCoverageWeight * input.peatFrac;
  const dryContribution = 100 * peatFactor * RISK_CONFIG.weights.dry * dry;
  const clearContribution = 100 * peatFactor * RISK_CONFIG.weights.clear * clear;
  const hotContribution = 100 * peatFactor * RISK_CONFIG.weights.hot * hot;
  const baseRisk = dryContribution + clearContribution + hotContribution;
  const synergyApplied =
    dry >= RISK_CONFIG.synergy.dryThreshold &&
    clear >= RISK_CONFIG.synergy.clearThreshold;
  const risk = Math.min(
    100,
    baseRisk *
      (synergyApplied ? RISK_CONFIG.synergy.multiplier : 1),
  );
  const synergyContribution = risk - baseRisk;

  return {
    risk,
    dry,
    clear,
    hot,
    peatFactor,
    dryContribution,
    clearContribution,
    hotContribution,
    synergyContribution,
    synergyApplied,
  };
}
