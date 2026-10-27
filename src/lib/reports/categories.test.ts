import { describe, expect, it } from "vitest";
import { categorizeItem, CATEGORY_LABELS } from "@/lib/reports/categories";

describe("categorizeItem", () => {
  it.each([
    ["Rebar 12mm (Grade 60)", "construction"],
    ["Washed sand", "construction"],
    ["Plywood sheet 18mm", "construction"],
    ["أسمنت بورتلاندي 50 كجم", "construction"],
    ["بلك خرساني 20 سم", "construction"],
    ["Corrugated carton 40×30×30", "packaging"],
    ["Packing tape 48mm", "packaging"],
    ["Wooden pallet 120×100", "packaging"],
    ["رول تغليف استرتش", "packaging"],
    ["Ergonomic office chair", "office"],
    ["سبورة بيضاء 120×90", "office"],
    ["ورق تصوير A4", "office"],
    ['Laptop 14" i7 16GB', "it"],
    ["Laser printer A4 duplex", "it"],
    ["Bearing SKF 6205-2RS", "maintenance"],
    ["V-belt B52", "maintenance"],
    ["Diesel generator oil filter", "maintenance"],
    ["طقم جوانات مضخة هيدروليك", "maintenance"],
    ["فلتر هواء للمولد", "maintenance"],
    ["LED panel light 60x60", "electrical"],
    ["كابل كهرباء 4 مم", "electrical"],
    ["Boundary wall works", "services"],
    ["تنظيف الموقع", "services"],
    ["Something unusual", "other"],
    ["", "other"],
  ])("%s → %s", (name, category) => {
    expect(categorizeItem(name)).toBe(category);
  });

  it("has a label for every category", () => {
    for (const c of ["construction", "packaging", "office", "it", "maintenance", "electrical", "services", "other"] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});
