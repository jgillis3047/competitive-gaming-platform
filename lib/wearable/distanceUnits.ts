/** Convert HealthKit / GPX distance quantity to meters. */
export function distanceToMeters(quantity: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "m" || u === "meter" || u === "meters") return quantity;
  if (u === "km" || u === "kilometer" || u === "kilometers") return quantity * 1000;
  if (u === "mi" || u === "mile" || u === "miles") return quantity * 1609.344;
  if (u === "ft" || u === "foot" || u === "feet") return quantity * 0.3048;
  if (u === "yd" || u === "yard" || u === "yards") return quantity * 0.9144;
  return quantity;
}
