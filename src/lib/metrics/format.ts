const MINUS = "−";

export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return "< 1 h";
  if (hours < 10) return `${Math.round(hours * 10) / 10} h`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

/** Signed relative change (+150%, −12%); null when there's nothing to compare against. */
export function formatChange(change: number | null): string | null {
  if (change === null) return null;
  const pct = Math.round(change * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${MINUS}${Math.abs(pct)}%`;
}

export function formatPct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

/** "SAR 12,341" — headline figures drop the halalas. Uses a true minus sign. */
export function formatMoneyWhole(value: number, currency: string): string {
  const abs = Math.abs(Math.round(value)).toLocaleString("en-US");
  return `${value < 0 ? MINUS : ""}${currency} ${abs}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS[m - 1];
  return withYear ? `${name} ${y}` : name;
}
