import { describe, expect, it } from "vitest";
import { parseSupplierListParams, sortAndFilterSuppliers, type SupplierListRow } from "@/lib/scorecard/list";

const rows: SupplierListRow[] = [
  { id: "a", label: "Zeta Trading", score: 72, lastActive: "2026-09-01T00:00:00Z" },
  { id: "b", label: "alpha supplies", score: null, lastActive: "2026-10-01T00:00:00Z" },
  { id: "c", label: "Beta Co", score: 88, lastActive: null },
  { id: "d", label: "Gamma", score: 40, lastActive: "2026-08-01T00:00:00Z" },
];

describe("parseSupplierListParams", () => {
  it("defaults to score order with no minimum", () => {
    expect(parseSupplierListParams({})).toEqual({ sort: "score", min: null });
  });
  it("accepts known values and ignores junk", () => {
    expect(parseSupplierListParams({ sort: "name", min: "70" })).toEqual({ sort: "name", min: 70 });
    expect(parseSupplierListParams({ sort: "drop table", min: "abc" })).toEqual({ sort: "score", min: null });
    expect(parseSupplierListParams({ min: "250" })).toEqual({ sort: "score", min: null });
  });
});

describe("sortAndFilterSuppliers", () => {
  it("sorts by score, best first, unscored last", () => {
    expect(sortAndFilterSuppliers(rows, { sort: "score", min: null }).map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
  it("sorts by name, case-insensitively", () => {
    expect(sortAndFilterSuppliers(rows, { sort: "name", min: null }).map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
  });
  it("sorts by most recent activity, never-active last", () => {
    expect(sortAndFilterSuppliers(rows, { sort: "recent", min: null }).map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
  });
  it("filters to a minimum score, excluding unscored suppliers", () => {
    expect(sortAndFilterSuppliers(rows, { sort: "score", min: 70 }).map((r) => r.id)).toEqual(["c", "a"]);
  });
});
