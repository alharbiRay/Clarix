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
    // Review regressions: rule order, unit words, services vs goods, Arabic parity.
    ["Gypsum panel 12mm", "construction"],
    ["Sandwich panel", "construction"],
    ["Acoustic ceiling panel", "construction"],
    ["Binding wire", "construction"],
    ["Tie wire for rebar", "construction"],
    ["Light duty pallet", "packaging"],
    ["Terminal block 4mm", "electrical"],
    ["Electrical tape", "electrical"],
    ["لوحة كهربائية", "electrical"],
    ["طقم مفكات 6 قطع", "maintenance"],
    ["ورق تصوير A4 كرتون", "office"],
    ["Work gloves", "safety"],
    ["Safety work boots", "safety"],
    ["Cleaning detergent", "office"],
    ["Printer maintenance service", "services"],
    ["Pump repair", "services"],
    ["AC maintenance contract", "services"],
    ["صيانة مضخات", "services"],
    ["Water filter", "maintenance"],
    ["فلتر مياه", "maintenance"],
    ["Split unit air conditioner 2 ton", "hvac"],
    ["مكيف سبليت", "hvac"],
    ["Generator preventive maintenance kit", "maintenance"],
    ["Something unusual", "other"],
    ["", "other"],
  ])("%s → %s", (name, category) => {
    expect(categorizeItem(name)).toBe(category);
  });

  it("has a label for every category", () => {
    for (const c of ["construction", "packaging", "office", "it", "maintenance", "electrical", "hvac", "safety", "services", "other"] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});
