export function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  // Saudi time: on Vercel the server runs in UTC, which shifts dates near midnight.
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
}
