export type SupplierSort = "score" | "name" | "recent";
export const SCORE_FILTERS = [50, 70, 85] as const;

export interface SupplierListParams {
  sort: SupplierSort;
  min: number | null;
}

export interface SupplierListRow {
  id: string;
  label: string;
  score: number | null;
  lastActive: string | null;
}

/** Search params → validated options (anything unexpected falls back to defaults). */
export function parseSupplierListParams(params: { sort?: string; min?: string }): SupplierListParams {
  const sort: SupplierSort = params.sort === "name" || params.sort === "recent" ? params.sort : "score";
  const n = params.min === undefined ? NaN : Number(params.min);
  const min = Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
  return { sort, min };
}

export function sortAndFilterSuppliers<T extends SupplierListRow>(rows: T[], { sort, min }: SupplierListParams): T[] {
  const filtered = min === null ? rows : rows.filter((r) => r.score !== null && r.score >= min);
  const sorted = [...filtered];
  if (sort === "name") {
    sorted.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  } else if (sort === "recent") {
    sorted.sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
  } else {
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.label.localeCompare(b.label));
  }
  return sorted;
}
