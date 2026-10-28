/**
 * Spend categories for reports. RFQ line items carry no category field, so
 * one is derived from the item name: the same bilingual normalization price
 * history uses (src/lib/pricing/normalize.ts) turns "أسمنت بورتلاندي" into
 * "cement portland", then rules pick a category (D-058):
 *   1. multi-word phrases ("sandwich panel", "work gloves", "binding wire"),
 *      most specific first;
 *   2. services ("maintenance contract", "installation", "repair", "works");
 *   3. single keywords, in category order.
 * Unit words ("pieces", "carton") are ignored, so "6-piece screwdriver set" or
 * "a carton of copy paper" are judged by what they are. Unrecognised → Other.
 */
import { isKnownUnit, normalizeItem } from "@/lib/pricing/normalize";

export type Category =
  | "construction"
  | "packaging"
  | "office"
  | "it"
  | "maintenance"
  | "electrical"
  | "hvac"
  | "safety"
  | "services"
  | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  construction: "Construction materials",
  packaging: "Packaging",
  office: "Office supplies",
  it: "IT equipment",
  maintenance: "Maintenance & spare parts",
  electrical: "Electrical",
  hvac: "HVAC & cooling",
  safety: "Safety & PPE",
  services: "Services & works",
  other: "Other",
};

// Phrases and keywords are written as normalized tokens: lower-case English
// (after the glossary) or Arabic with ة→ه, أ→ا and no article.
const PHRASES: [Category, string[]][] = [
  ["construction", ["sandwich panel", "gypsum panel", "gypsum board", "ceiling panel", "acoustic ceiling", "binding wire", "tie wire", "wire mesh"]],
  ["electrical", ["electrical tape", "electrical panel", "distribution board", "terminal block", "lighting panel", "لوحه كهرباييه", "لوحه توزيع"]],
  ["safety", ["work gloves", "safety gloves", "safety boots", "work boots", "safety shoes", "safety helmet", "hard hat", "safety vest", "reflective vest", "safety glasses", "first aid", "fire extinguisher", "قفازات عمل", "خوذه سلامه", "طفايه حريق"]],
  ["hvac", ["air conditioner", "split unit", "ac unit", "مكيف هواء"]],
  ["maintenance", ["maintenance kit", "spare parts", "water filter", "air filter", "oil filter", "فلتر مياه", "فلتر هواء", "قطع غيار"]],
  ["office", ["copy paper", "office chair", "ورق تصوير"]],
  ["it", ["laser printer"]],
  ["services", ["maintenance contract", "maintenance service", "cleaning service", "cleaning services", "عقد صيانه"]],
];

const SERVICE_WORDS = [
  "works", "installation", "repair", "repairs", "service", "services", "contract", "labour", "labor", "transport",
  "transportation", "consulting", "صيانه", "تركيب", "اصلاح", "خدمه", "خدمات", "نقل", "اعمال", "تنظيف",
];

const KEYWORDS: [Category, string[]][] = [
  ["safety", ["gloves", "helmet", "ppe", "goggles", "respirator", "harness", "extinguisher", "قفازات", "خوذه", "سلامه"]],
  ["hvac", ["hvac", "chiller", "ac", "conditioner", "duct", "refrigerant", "مكيف", "مكيفات", "تكييف"]],
  ["maintenance", ["bearing", "v-belt", "belt", "filter", "seal", "gasket", "pump", "pumps", "generator", "valve", "spare", "hydraulic", "lubricant", "grease", "oil", "screwdriver", "screwdrivers", "wrench", "tools", "جوانات", "صمام", "مضخه", "مضخات", "فلتر", "زيت", "مفك", "مفكات", "عده"]],
  ["it", ["laptop", "laptops", "computer", "computers", "printer", "printers", "monitor", "router", "server", "keyboard", "mouse", "toner", "ssd", "ups", "network", "حاسب", "حاسوب", "طابعه", "شاشه", "لابتوب"]],
  // Before electrical, so "light duty pallet" is a pallet.
  ["packaging", ["stretch", "film", "tape", "pallet", "pallets", "packing", "bubble", "wrap", "strap", "corrugated", "تغليف", "طبليه", "شريط"]],
  ["electrical", ["electrical", "led", "light", "lights", "lighting", "lamp", "cable", "cables", "breaker", "socket", "switch", "كابل", "كابلات", "اضاءه", "كهرباء", "كهربايي", "كهرباييه", "قاطع", "لمبه"]],
  ["construction", ["cement", "sand", "rebar", "steel", "concrete", "block", "plywood", "gravel", "aggregate", "brick", "tile", "tiles", "paint", "gypsum", "timber", "wire", "بلاط", "دهان", "طوب", "خرسانه", "جبس", "بحص", "حديد"]],
  ["office", ["paper", "chair", "chairs", "desk", "whiteboard", "stationery", "pen", "pens", "folder", "binder", "cabinet", "detergent", "ورق", "مكتب", "قرطاسيه", "اقلام", "منظف"]],
];

function hasPhrase(tokens: string[], phrase: string) {
  const words = phrase.split(" ");
  outer: for (let i = 0; i <= tokens.length - words.length; i++) {
    for (let k = 0; k < words.length; k++) if (tokens[i + k] !== words[k]) continue outer;
    return true;
  }
  return false;
}

/**
 * Normalized tokens with unit words dropped. normalizeItem returns its tokens
 * sorted, so word order (needed for phrases) comes from normalizing each word
 * in turn; the whole-name tokens follow after a separator, so multi-word
 * glossary entries ("بلك خرساني" → "concrete block") still count as keywords.
 */
function tokenize(name: string): string[] {
  const inOrder = name
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => normalizeItem(word).tokens)
    .filter((t) => !isKnownUnit(t));
  const whole = normalizeItem(name).tokens.filter((t) => !isKnownUnit(t));
  return whole.length ? [...inOrder, "|", ...whole] : [];
}

export function categorizeItem(name: string): Category {
  const tokens = tokenize(name ?? "");
  if (tokens.length === 0) return "other";
  const set = new Set(tokens);
  for (const [category, phrases] of PHRASES) if (phrases.some((p) => hasPhrase(tokens, p))) return category;
  if (SERVICE_WORDS.some((w) => set.has(w))) return "services";
  for (const [category, words] of KEYWORDS) if (words.some((w) => set.has(w))) return category;
  return "other";
}
