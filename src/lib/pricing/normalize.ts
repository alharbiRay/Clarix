/**
 * Deterministic item-name normalization for price history: two line items
 * that describe the same product (in Arabic or English, any word order,
 * "50 كجم" vs "50kg") get the same key. No AI involved — a small bilingual
 * procurement glossary covers the common cross-language cases.
 */

const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

export function normalizeArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ → ا
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian digits
    .replace(/،/g, ","); // Arabic comma
}

function clean(input: string) {
  return normalizeArabic(input.normalize("NFKC")).toLowerCase().replace(/\s+/g, " ").trim();
}

// Unit aliases → canonical unit. Keys are already clean()ed.
const UNIT_ALIASES: Record<string, string[]> = {
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "كجم", "كغ", "كيلو", "كيلوجرام", "كيلوغرام"],
  g: ["g", "gm", "gram", "grams", "جم", "جرام", "غرام"],
  mm: ["mm", "مم", "ملم", "مليمتر"],
  cm: ["cm", "سم", "سنتيمتر"],
  m: ["m", "meter", "meters", "metre", "metres", "م", "متر"],
  m3: ["m3", "cbm", "cubic meter", "cubic meters", "م3", "متر مكعب"],
  ton: ["ton", "tons", "tonne", "tonnes", "t", "طن"],
  l: ["l", "liter", "liters", "litre", "litres", "لتر"],
  pcs: ["pcs", "pc", "piece", "pieces", "unit", "units", "ea", "each", "nos", "قطعه", "حبه", "عدد"],
  box: ["box", "boxes", "كرتون", "علبه"],
  roll: ["roll", "rolls", "رول", "لفه"],
  set: ["set", "sets", "kit", "kits", "طقم"],
  bag: ["bag", "bags", "sack", "sacks", "كيس"],
};
const UNIT_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
  for (const a of aliases) UNIT_LOOKUP.set(a, canonical);
}

export function normalizeUnit(unit: string): string {
  const c = clean(unit);
  return UNIT_LOOKUP.get(c) ?? c;
}

/**
 * Bilingual glossary: normalized Arabic (or English variant) phrase → the
 * canonical English words. Longest phrases are applied first.
 */
const GLOSSARY: [string, string][] = [
  ["طقم جوانات مضخه هيدروليك", "hydraulic pump seal kit"],
  ["رول تغليف استرتش", "stretch film"],
  ["رول تغليف", "stretch film"],
  ["حديد تسليح", "rebar"],
  ["reinforcement bar", "rebar"],
  ["reinforcing bar", "rebar"],
  ["steel rebar", "rebar"],
  ["ورق تصوير", "copy paper"],
  ["photocopy paper", "copy paper"],
  ["بلك خرساني", "concrete block"],
  ["بلوك خرساني", "concrete block"],
  ["كرسي مكتب", "office chair"],
  ["سبوره بيضاء", "whiteboard"],
  ["white board", "whiteboard"],
  ["طابعه ليزر", "laser printer"],
  ["كرتون مضلع", "corrugated carton"],
  ["طبليه خشب", "wooden pallet"],
  ["شريط لاصق", "packing tape"],
  ["رولمان بلي", "bearing"],
  ["فلتر هواء", "air filter"],
  ["فلتر زيت", "oil filter"],
  ["سير مروحه", "v-belt"],
  ["لوح خشب", "plywood"],
  ["اسمنت", "cement"],
  ["بورتلاندي", "portland"],
  ["بورتلاند", "portland"],
  ["ابيض", "white"],
  ["رمل", "sand"],
  ["مغسول", "washed"],
  ["كرسي", "chair"],
  ["مولد", "generator"],
  ["للمولد", "generator"],
  ["مضخه", "pump"],
  ["حديد", "steel"],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

const STOPWORDS = new Set(["supply", "of", "for", "the", "and", "with", "a", "an", "توريد", "و", "من", "الى", "مع"]);

const SIZE_UNITS = "kg|kgs|g|mm|cm|ml|m|l|ton|tons|كجم|كغ|كيلو|جم|مم|ملم|سم|م|لتر|طن|inch|in";
const SIZE_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${SIZE_UNITS})(?=$|[^a-z0-9\\u0600-\\u06ff])`, "g");
const DIMENSION_RE = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?/g;

export interface NormalizedItem {
  /** Order-insensitive identity key ("" when the name carries no identifying words). */
  key: string;
  tokens: string[];
}

export function normalizeItem(name: string): NormalizedItem {
  let s = clean(name).replace(/×/g, "x");

  s = s.replace(DIMENSION_RE, (_m, a: string, b: string, c?: string) => ` ${[a, b, c].filter(Boolean).join("x")} `);
  s = s.replace(SIZE_RE, (_m, n: string, unit: string) => ` ${n}${normalizeUnit(unit)} `);

  for (const [phrase, canonical] of GLOSSARY) {
    if (s.includes(phrase)) s = s.split(phrase).join(` ${canonical} `);
  }

  const tokens = Array.from(
    new Set(
      s
        .split(/[^a-z0-9؀-ۿ.\-]+/)
        .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
        .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    )
  ).sort();

  return { key: tokens.join(" "), tokens };
}
