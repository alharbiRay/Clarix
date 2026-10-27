/**
 * Spend categories for reports. RFQ line items carry no category field, so
 * one is derived from the item name: the same bilingual normalization price
 * history uses (src/lib/pricing/normalize.ts) turns "أسمنت بورتلاندي" into
 * "cement portland", then whole-word keyword rules pick a category. First
 * matching rule wins; anything unrecognised is "other". See D-057.
 */
import { normalizeItem } from "@/lib/pricing/normalize";

export type Category = "construction" | "packaging" | "office" | "it" | "maintenance" | "electrical" | "services" | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  construction: "Construction materials",
  packaging: "Packaging",
  office: "Office supplies",
  it: "IT equipment",
  maintenance: "Maintenance & spare parts",
  electrical: "Electrical",
  services: "Services & works",
  other: "Other",
};

// Keywords are matched against normalized tokens (lower-case English after
// the glossary, or normalized Arabic: ة→ه, أ→ا, no article).
const RULES: [Category, string[]][] = [
  ["maintenance", ["bearing", "v-belt", "belt", "filter", "seal", "gasket", "pump", "generator", "valve", "spare", "hydraulic", "lubricant", "grease", "جوانات", "صمام", "قطع"]],
  ["it", ["laptop", "computer", "printer", "monitor", "router", "server", "keyboard", "mouse", "toner", "ssd", "ups", "network", "حاسب", "حاسوب", "طابعه", "شاشه", "لابتوب"]],
  ["electrical", ["led", "light", "lighting", "lamp", "cable", "wire", "breaker", "socket", "switch", "panel", "كابل", "سلك", "اضاءه", "كهرباء", "قاطع", "لمبه"]],
  ["construction", ["cement", "sand", "rebar", "steel", "concrete", "block", "plywood", "gravel", "aggregate", "brick", "tile", "paint", "gypsum", "timber", "بلاط", "دهان", "طوب", "خرسانه", "جبس", "بحص"]],
  ["packaging", ["carton", "stretch", "film", "tape", "pallet", "packing", "bubble", "wrap", "strap", "كرتون", "تغليف", "طبليه"]],
  ["office", ["paper", "chair", "desk", "whiteboard", "stationery", "pen", "folder", "binder", "cabinet", "ورق", "مكتب", "قرطاسيه", "اقلام"]],
  ["services", ["works", "work", "service", "services", "maintenance", "installation", "cleaning", "transport", "labour", "labor", "repair", "صيانه", "خدمه", "خدمات", "تركيب", "تنظيف", "نقل", "اعمال"]],
];

export function categorizeItem(name: string): Category {
  const tokens = new Set(normalizeItem(name ?? "").tokens);
  if (tokens.size === 0) return "other";
  for (const [category, words] of RULES) {
    if (words.some((w) => tokens.has(w))) return category;
  }
  return "other";
}
