export function parseCostCap(): number {
  /* c8 ignore next */
  const raw = process.env["DAILY_COST_CAP_USD"] ?? "20"
  const parsed = parseFloat(raw)
  return isFinite(parsed) && parsed > 0 ? parsed : 20
}

export function isCostCapExceeded(todaySpendUsd: number, capUsd: number): boolean {
  return capUsd > 0 && todaySpendUsd >= capUsd
}
