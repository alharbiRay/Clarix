/**
 * Pure, deterministic generator for the demo workspace (scripts/seed-demo.ts
 * writes it). Same seed + clock + buyer → byte-identical rows, so re-seeding
 * upserts in place instead of duplicating anything.
 *
 * Six months of believable procurement history for a Saudi contractor:
 * bilingual item names, suppliers with distinct personalities, prices that
 * drift over time (feeds price history), and every RFQ lifecycle stage. RFQs
 * marked auto-approved genuinely satisfy the auto-approval rules
 * (src/lib/auto-approval.ts), so the demo never shows a decision the real
 * engine wouldn't make.
 */
import { createRandom, stableUuid, type Random } from "@/lib/demo/random";
import type { RecommendationContent } from "@/lib/gemini";

export const DEMO_SEED = "clarix-demo-v1";
export const DEMO_MODEL = "gemini-2.5-flash";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MAX_AUTO_DELIVERY_DAYS = 14;

// ---------------------------------------------------------------------------
// Row shapes (mirror the table columns written by the seed script)
// ---------------------------------------------------------------------------

export type DemoStage =
  | "draft"
  | "sent"
  | "partially_replied"
  | "compared"
  | "needs_review"
  | "auto_approved"
  | "awarded";

export interface DemoRfqRow {
  id: string;
  buyer_id: string;
  title: string;
  project: string;
  description: string | null;
  currency: "SAR";
  deadline: string;
  status: "draft" | "sent" | "closed" | "awarded";
  created_at: string;
  updated_at: string;
  is_demo: true;
}

export interface DemoRfqItemRow {
  id: string;
  rfq_id: string;
  position: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  created_at: string;
}

export interface DemoSupplierRow {
  id: string;
  buyer_id: string;
  email: string;
  company_name: string;
  contact_name: string;
  phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
  is_demo: true;
}

export interface DemoInviteRow {
  id: string;
  rfq_id: string;
  email: string;
  company_name: string;
  contact_name: string;
  token: string;
  status: "pending" | "sent" | "viewed" | "submitted" | "declined";
  invited_at: string | null;
  viewed_at: string | null;
  created_at: string;
  supplier_id: string;
}

export interface DemoQuoteRow {
  id: string;
  rfq_id: string;
  supplier_id: string; // rfq_suppliers.id
  source: "form" | "manual" | "email";
  status: "submitted" | "confirmed";
  delivery_days: number;
  payment_terms: string;
  warranty: string | null;
  notes: string | null;
  pdf_path: null;
  extraction_raw: Record<string, unknown> | null;
  submitted_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoQuoteItemRow {
  id: string;
  quote_id: string;
  rfq_item_id: string;
  unit_price: number | null;
  total_price: number | null;
  notes: string | null;
}

export interface DemoRecommendationRow {
  id: string;
  rfq_id: string;
  content: RecommendationContent;
  model: string;
  auto_generated: boolean;
  created_at: string;
}

export interface DemoAwardRow {
  rfq_id: string;
  decision: "auto_approved" | "review_needed" | "differs_from_cheapest";
  recommended_supplier_id: string;
  recommended_quote_id: string;
  cheapest_supplier_id: string;
  cheapest_quote_id: string;
  reason: string | null;
  po_sent_at: string | null;
  created_at: string;
}

export interface DemoNotificationRow {
  id: string;
  buyer_id: string;
  rfq_id: string;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface DemoPreferencesRow {
  rfq_id: string;
  weights: { price: number; delivery: number; warranty: number; paymentTerms: number };
  has_deadline: boolean;
  deadline_date: string | null;
  max_budget: number | null;
  updated_at: string;
}

export interface DemoDataset {
  profile: { id: string; full_name: string; company: string; is_demo: true; auto_approval_enabled: true };
  suppliers: DemoSupplierRow[];
  rfqs: DemoRfqRow[];
  rfq_items: DemoRfqItemRow[];
  rfq_suppliers: DemoInviteRow[];
  quotes: DemoQuoteRow[];
  quote_items: DemoQuoteItemRow[];
  rfq_preferences: DemoPreferencesRow[];
  ai_recommendations: DemoRecommendationRow[];
  rfq_awards: DemoAwardRow[];
  notifications: DemoNotificationRow[];
  meta: { stages: { rfqId: string; stage: DemoStage }[] };
}

// ---------------------------------------------------------------------------
// Cast: suppliers and catalog
// ---------------------------------------------------------------------------

type Category = "construction" | "office" | "packaging" | "spare_parts";

const PROJECT: Record<Category, string> = {
  construction: "Construction supplies",
  office: "Office equipment",
  packaging: "Packaging",
  spare_parts: "Spare parts",
};

interface Persona {
  key: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  notes: string;
  categories: Category[];
  priceFactor: number;
  delivery: [number, number];
  warrantyChance: number;
  warranties: string[];
  responseDays: [number, number];
  declineChance: number;
  missingItemChance: number;
  paymentTerms: string[];
  /** Tends to fail the auto-approval rules (no warranty / slow) — used to stage "needs review". */
  risky: boolean;
}

// Emails use the reserved .example TLD: nothing can ever be delivered to them.
const PERSONAS: Persona[] = [
  {
    key: "alrashid",
    company: "Al Rashid Building Materials",
    contact: "Faisal Al Rashid",
    email: "sales@alrashid-materials.example",
    phone: "+966 11 482 1190",
    notes: "Fast and cheap. Riyadh yard, same-week delivery on stock items.",
    categories: ["construction", "packaging"],
    priceFactor: 0.93,
    delivery: [3, 7],
    warrantyChance: 0.85,
    warranties: ["6 months", "12 months"],
    responseDays: [0.15, 0.8],
    declineChance: 0.05,
    missingItemChance: 0,
    paymentTerms: ["Net 30", "50% advance, 50% on delivery"],
    risky: false,
  },
  {
    key: "gulfoffice",
    company: "Gulf Office Supplies",
    contact: "Sara Al Qahtani",
    email: "quotes@gulfoffice.example",
    phone: "+966 12 660 4471",
    notes: "Pricey but reliable. Always quotes a long warranty.",
    categories: ["office", "packaging", "spare_parts"],
    priceFactor: 1.11,
    delivery: [4, 8],
    warrantyChance: 1,
    warranties: ["24 months", "36 months"],
    responseDays: [0.4, 1.4],
    declineChance: 0.02,
    missingItemChance: 0,
    paymentTerms: ["Net 45", "Net 30"],
    risky: false,
  },
  {
    key: "najd",
    company: "مؤسسة نجد لقطع الغيار",
    contact: "Abdullah Al Otaibi",
    email: "info@najd-spares.example",
    phone: "+966 16 381 2205",
    notes: "Slow to respond and slow to deliver, but often the cheapest on spare parts.",
    categories: ["spare_parts", "construction"],
    priceFactor: 0.9,
    delivery: [18, 32],
    warrantyChance: 0.9,
    warranties: ["12 شهر", "12 months"],
    responseDays: [2.5, 6],
    declineChance: 0.18,
    missingItemChance: 0.1,
    paymentTerms: ["Net 60"],
    risky: true,
  },
  {
    key: "redsea",
    company: "Red Sea Packaging Co.",
    contact: "Omar Bakr",
    email: "sales@redsea-pack.example",
    phone: "+966 12 225 9934",
    notes: "Competitive on packaging. Usually quotes without any warranty.",
    categories: ["packaging", "office"],
    priceFactor: 0.9,
    delivery: [6, 12],
    warrantyChance: 0.25,
    warranties: ["6 months"],
    responseDays: [0.8, 2],
    declineChance: 0.08,
    missingItemChance: 0.05,
    paymentTerms: ["Cash on delivery", "Net 15"],
    risky: true,
  },
  {
    key: "eastern",
    company: "Eastern Province Trading",
    contact: "Khalid Al Dosari",
    email: "rfq@ept-trading.example",
    phone: "+966 13 857 3310",
    notes: "Middle of the pack on price and speed. Covers almost everything.",
    categories: ["construction", "office", "packaging", "spare_parts"],
    priceFactor: 1.0,
    delivery: [7, 13],
    warrantyChance: 0.9,
    warranties: ["12 months"],
    responseDays: [0.8, 2.5],
    declineChance: 0.1,
    missingItemChance: 0.05,
    paymentTerms: ["Net 30"],
    risky: false,
  },
  {
    key: "madinah",
    company: "حديد المدينة للتجارة",
    contact: "Yousef Al Harbi",
    email: "orders@madinah-steel.example",
    phone: "+966 14 845 6620",
    notes: "Very cheap on steel and cement, but often leaves lines unpriced.",
    categories: ["construction"],
    priceFactor: 0.88,
    delivery: [9, 16],
    warrantyChance: 0.6,
    warranties: ["12 شهر"],
    responseDays: [1, 3],
    declineChance: 0.1,
    missingItemChance: 0.3,
    paymentTerms: ["30% advance, balance Net 30"],
    risky: true,
  },
  {
    key: "tamimi",
    company: "Tamimi Tech Solutions",
    contact: "Nora Al Tamimi",
    email: "b2b@tamimi-tech.example",
    phone: "+966 11 293 7781",
    notes: "IT and office equipment specialist. Strong warranties, fair prices.",
    categories: ["office", "spare_parts"],
    priceFactor: 1.04,
    delivery: [5, 10],
    warrantyChance: 1,
    warranties: ["12 months", "24 months", "36 months"],
    responseDays: [0.3, 1.2],
    declineChance: 0.04,
    missingItemChance: 0,
    paymentTerms: ["Net 30"],
    risky: false,
  },
];

interface CatalogItem {
  name: string;
  description: string | null;
  unit: string;
  basePrice: number;
  /** Fractional price change per month (market drift). */
  drift: number;
  qty: [number, number];
}

const CATALOG: Record<Category, CatalogItem[]> = {
  construction: [
    { name: "أسمنت بورتلاندي 50 كجم", description: "Type I, sulfate resistant", unit: "bags", basePrice: 17.5, drift: 0.018, qty: [200, 900] },
    { name: "Rebar 12mm (Grade 60)", description: null, unit: "tons", basePrice: 2780, drift: 0.012, qty: [4, 18] },
    { name: "بلك خرساني 20 سم", description: "Hollow, load bearing", unit: "pcs", basePrice: 3.1, drift: 0.008, qty: [2000, 9000] },
    { name: "Washed sand", description: null, unit: "m³", basePrice: 62, drift: 0.01, qty: [40, 160] },
    { name: "Plywood sheet 18mm", description: "Marine grade", unit: "pcs", basePrice: 92, drift: -0.004, qty: [60, 240] },
  ],
  office: [
    { name: "Ergonomic office chair", description: "Mesh back, adjustable lumbar", unit: "pcs", basePrice: 640, drift: -0.003, qty: [8, 40] },
    { name: "Laptop 14\" Core i5 16GB", description: "512GB SSD, Arabic/English keyboard", unit: "pcs", basePrice: 3850, drift: -0.009, qty: [5, 25] },
    { name: "ورق تصوير A4", description: "80gsm, 5 reams per box", unit: "boxes", basePrice: 108, drift: 0.006, qty: [20, 120] },
    { name: "Laser printer A4 duplex", description: null, unit: "pcs", basePrice: 1420, drift: -0.004, qty: [2, 8] },
    { name: "سبورة بيضاء 120×90", description: "Magnetic", unit: "pcs", basePrice: 275, drift: 0.002, qty: [4, 16] },
  ],
  packaging: [
    { name: "Corrugated carton 40×30×30", description: "Double wall", unit: "pcs", basePrice: 4.4, drift: 0.015, qty: [3000, 12000] },
    { name: "رول تغليف استرتش", description: "23 micron, 50cm", unit: "rolls", basePrice: 37, drift: 0.012, qty: [100, 500] },
    { name: "Wooden pallet 120×100", description: "Heat treated (ISPM-15)", unit: "pcs", basePrice: 41, drift: 0.007, qty: [150, 600] },
    { name: "Packing tape 48mm", description: null, unit: "rolls", basePrice: 6.2, drift: 0.004, qty: [400, 2000] },
  ],
  spare_parts: [
    { name: "طقم جوانات مضخة هيدروليك", description: "Rexroth A10VSO compatible", unit: "sets", basePrice: 335, drift: 0.01, qty: [4, 20] },
    { name: "Bearing SKF 6205-2RS", description: null, unit: "pcs", basePrice: 46, drift: 0.008, qty: [20, 120] },
    { name: "V-belt B52", description: null, unit: "pcs", basePrice: 34, drift: 0.005, qty: [20, 80] },
    { name: "فلتر هواء للمولد", description: "Perkins 1100 series", unit: "pcs", basePrice: 118, drift: 0.011, qty: [10, 50] },
    { name: "Diesel generator oil filter", description: null, unit: "pcs", basePrice: 72, drift: 0.009, qty: [10, 60] },
  ],
};

const TITLES: Record<Category, string[]> = {
  construction: [
    "Site materials — Al Malqa villas, phase 2",
    "طلب مواد بناء - مستودع السلي",
    "Foundation pour, Tower B",
    "Boundary wall works, Diriyah site",
    "مواد خرسانة - مشروع النرجس",
  ],
  office: [
    "New hires: laptops and chairs",
    "تجهيز مكاتب فرع جدة",
    "Head office refresh Q3",
    "Meeting rooms equipment",
  ],
  packaging: [
    "Monthly carton restock",
    "مستلزمات تغليف للتصدير",
    "Ramadan season packaging",
    "Warehouse pallets and wrap",
  ],
  spare_parts: [
    "Generator preventive maintenance kit",
    "قطع غيار مضخات الموقع",
    "Crusher line bearings and belts",
    "Hydraulic overhaul — excavator fleet",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (t: number) => new Date(t).toISOString();

function sar(n: number) {
  return `SAR ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function warrantyMonths(w: string | null) {
  if (!w) return 0;
  const m = /(\d+)/.exec(w);
  return m ? Number(m[1]) : 12;
}

function tokenFor(secret: string, key: string) {
  return (stableUuid(secret, `token:${key}`) + stableUuid(secret, `token2:${key}`)).replace(/-/g, "").slice(0, 48);
}

interface DraftQuote {
  row: DemoQuoteRow;
  items: DemoQuoteItemRow[];
  persona: Persona;
  invite: DemoInviteRow;
}

function quoteTotal(q: DraftQuote): number | null {
  if (q.items.some((i) => i.total_price === null)) return null;
  return round2(q.items.reduce((s, i) => s + (i.total_price ?? 0), 0));
}

function compliant(q: DraftQuote) {
  return q.row.delivery_days <= MAX_AUTO_DELIVERY_DAYS && Boolean(q.row.warranty);
}

function scaleQuote(q: DraftQuote, factor: number, rfqItems: DemoRfqItemRow[]) {
  for (const qi of q.items) {
    if (qi.unit_price === null) continue;
    const item = rfqItems.find((i) => i.id === qi.rfq_item_id)!;
    qi.unit_price = round2(qi.unit_price * factor);
    qi.total_price = round2(qi.unit_price * item.quantity);
  }
}

function cheapestComplete(quotes: DraftQuote[]) {
  return quotes
    .map((q) => ({ q, total: quoteTotal(q) }))
    .filter((x): x is { q: DraftQuote; total: number } => x.total !== null)
    .sort((a, b) => a.total - b.total)[0];
}

/** Makes `target` the strictly cheapest complete quote by pricing it a few percent under the rest. */
function makeCheapest(target: DraftQuote, quotes: DraftQuote[], rfqItems: DemoRfqItemRow[], random: Random) {
  const others = quotes
    .filter((q) => q !== target)
    .map(quoteTotal)
    .filter((t): t is number => t !== null);
  const total = quoteTotal(target);
  if (total === null || others.length === 0) return;
  const floor = Math.min(...others);
  if (total < floor * 0.99) return;
  scaleQuote(target, (floor * random.float(0.9, 0.97)) / total, rfqItems);
}

// ---------------------------------------------------------------------------
// Recommendation text (what Gemini would have written, from real numbers)
// ---------------------------------------------------------------------------

function buildRecommendation(
  quotes: DraftQuote[],
  pick: DraftQuote,
  weights: DemoPreferencesRow["weights"]
): RecommendationContent {
  const priced = quotes.map((q) => ({ q, total: quoteTotal(q) }));
  const complete = priced.filter((p) => p.total !== null) as { q: DraftQuote; total: number }[];
  const cheapest = complete.sort((a, b) => a.total - b.total)[0];
  const fastest = Math.min(...quotes.map((q) => q.row.delivery_days));
  const longest = Math.max(...quotes.map((q) => warrantyMonths(q.row.warranty)));
  const label = (q: DraftQuote) => q.invite.company_name;

  const ranked = [pick, ...quotes.filter((q) => q !== pick).sort((a, b) => {
    const ta = quoteTotal(a) ?? Infinity;
    const tb = quoteTotal(b) ?? Infinity;
    return ta - tb;
  })];

  const ranking = ranked.map((q, i) => {
    const total = quoteTotal(q);
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    if (cheapest && q === cheapest.q) strengths.push(`Lowest complete total at ${sar(cheapest.total)}`);
    else if (total !== null && cheapest) {
      const pct = ((total - cheapest.total) / cheapest.total) * 100;
      weaknesses.push(`${pct.toFixed(1)}% above the cheapest complete quote`);
    }
    if (q.row.delivery_days === fastest) strengths.push(`Fastest delivery (${q.row.delivery_days} days)`);
    if (q.row.delivery_days > MAX_AUTO_DELIVERY_DAYS) weaknesses.push(`Slow delivery: ${q.row.delivery_days} days`);
    if (!q.row.warranty) weaknesses.push("No warranty offered");
    else if (warrantyMonths(q.row.warranty) === longest && longest >= 24) strengths.push(`Longest warranty (${q.row.warranty})`);
    const missing = q.items.filter((i) => i.total_price === null).length;
    if (missing > 0) weaknesses.push(`${missing} line item${missing === 1 ? "" : "s"} left unpriced`);
    if (strengths.length === 0) strengths.push(`Complete quote with ${q.row.payment_terms} terms`);
    return { supplier: label(q), rank: i + 1, strengths, weaknesses };
  });

  const pickTotal = quoteTotal(pick)!;
  const isCheapest = cheapest?.q === pick;
  const warrantyText = pick.row.warranty ? `a ${pick.row.warranty} warranty` : "no warranty";
  const recommendation = isCheapest
    ? `Award to ${label(pick)}: the lowest complete total at ${sar(pickTotal)}, with ${pick.row.delivery_days}-day delivery and ${warrantyText}.`
    : `Award to ${label(pick)}. It costs ${sar(pickTotal - cheapest!.total)} more than the cheapest quote, but delivers in ${pick.row.delivery_days} days with ${warrantyText}, which outweighs the price gap at your current priorities.`;

  const parts = [
    `${label(pick)} quoted ${sar(pickTotal)} in total with ${pick.row.delivery_days}-day delivery, ${warrantyText} and ${pick.row.payment_terms} payment terms.`,
  ];
  if (cheapest && !isCheapest) {
    parts.push(
      `${label(cheapest.q)} is cheaper at ${sar(cheapest.total)}, but ${
        !cheapest.q.row.warranty
          ? "offers no warranty"
          : cheapest.q.row.delivery_days > MAX_AUTO_DELIVERY_DAYS
            ? `needs ${cheapest.q.row.delivery_days} days to deliver`
            : "is weaker on delivery and warranty"
      }.`
    );
  }
  const others = complete.filter((c) => c.q !== pick && c.q !== cheapest?.q);
  if (others.length > 0) {
    parts.push(
      `The remaining quotes (${others.map((o) => `${label(o.q)} at ${sar(o.total)}`).join(", ")}) do not improve on either price or terms.`
    );
  }
  const incomplete = quotes.filter((q) => quoteTotal(q) === null);
  if (incomplete.length > 0) {
    parts.push(`${incomplete.map(label).join(", ")} left items unpriced, so ${incomplete.length === 1 ? "it" : "they"} cannot be ranked on total price.`);
  }

  const risks: string[] = [];
  if (pick.row.payment_terms.includes("advance")) risks.push(`${label(pick)} asks for an advance payment. Confirm a bank guarantee before paying.`);
  if (incomplete.length > 0) risks.push(`Unpriced lines from ${incomplete.map(label).join(", ")}: ask them to complete the quote if you want a full comparison.`);
  if (pick.row.warranty && warrantyMonths(pick.row.warranty) <= 6) risks.push(`The ${pick.row.warranty} warranty is short. Check what it covers.`);

  return { recommendation, reasoning: parts.join(" "), ranking, risks, weights, preferences: { hasDeadline: false, deadlineDate: null, maxBudget: null } };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  seed: string;
  now: Date;
  buyerId: string;
  /** Mixed into supplier-form tokens so they can't be derived from the public seed. */
  tokenSecret?: string;
}

/** Oldest → newest. Pending decisions sit near the present, as they would in real life. */
function stagePlan(random: Random): DemoStage[] {
  const settled: DemoStage[] = random.shuffle([
    ...Array<DemoStage>(8).fill("auto_approved"),
    ...Array<DemoStage>(4).fill("awarded"),
    ...Array<DemoStage>(2).fill("compared"),
  ]);
  return [
    ...settled,
    "needs_review",
    "needs_review",
    "needs_review",
    "needs_review",
    "partially_replied",
    "sent",
    "partially_replied",
    "partially_replied",
    "sent",
    "draft",
    "draft",
  ];
}

const DEFAULT_WEIGHTS = { price: 50, delivery: 50, warranty: 50, paymentTerms: 50 };

export function generateDemoDataset({ seed, now, buyerId, tokenSecret = seed }: GenerateOptions): DemoDataset {
  const random = createRandom(seed);
  const nowMs = now.getTime();
  const id = (key: string) => stableUuid(`${seed}:${buyerId}`, key);
  const start = nowMs - 176 * DAY;

  const data: DemoDataset = {
    profile: { id: buyerId, full_name: "Demo Buyer", company: "Al Waha Contracting", is_demo: true, auto_approval_enabled: true },
    suppliers: [],
    rfqs: [],
    rfq_items: [],
    rfq_suppliers: [],
    quotes: [],
    quote_items: [],
    rfq_preferences: [],
    ai_recommendations: [],
    rfq_awards: [],
    notifications: [],
    meta: { stages: [] },
  };

  const supplierIds = new Map<string, string>();
  for (const p of PERSONAS) {
    const sid = id(`supplier:${p.key}`);
    supplierIds.set(p.key, sid);
    data.suppliers.push({
      id: sid,
      buyer_id: buyerId,
      email: p.email,
      company_name: p.company,
      contact_name: p.contact,
      phone: p.phone,
      notes: p.notes,
      created_at: iso(start - 20 * DAY),
      updated_at: iso(start - 20 * DAY),
      is_demo: true,
    });
  }

  const stages = stagePlan(random);
  const categories: Category[] = ["construction", "office", "packaging", "spare_parts"];
  const titleCursor: Record<Category, number> = { construction: 0, office: 0, packaging: 0, spare_parts: 0 };

  stages.forEach((stage, index) => {
    const rfqId = id(`rfq:${index}`);
    const category = index < 4 ? categories[index] : random.pick(categories);
    const spacing = (175 * DAY) / (stages.length - 1);
    const createdMs = Math.min(start + index * spacing + random.float(-1.2, 1.2) * DAY, nowMs - 10 * HOUR);
    const title = TITLES[category][titleCursor[category]++ % TITLES[category].length];
    const deadlineMs = createdMs + random.int(10, 18) * DAY;

    data.meta.stages.push({ rfqId, stage });
    const rfqStatus: DemoRfqRow["status"] =
      stage === "draft" ? "draft" : stage === "auto_approved" || stage === "awarded" ? "awarded" : "sent";
    data.rfqs.push({
      id: rfqId,
      buyer_id: buyerId,
      title,
      project: PROJECT[category],
      description: random.chance(0.5) ? "Delivery to site, Riyadh. Prices excluding VAT." : null,
      currency: "SAR",
      deadline: iso(Math.max(deadlineMs, stage === "sent" || stage === "partially_replied" || stage === "draft" ? nowMs + random.int(3, 9) * DAY : deadlineMs)),
      status: rfqStatus,
      created_at: iso(createdMs),
      updated_at: iso(createdMs),
      is_demo: true,
    });

    // Line items
    const catalogItems = random.shuffle(CATALOG[category]).slice(0, random.int(2, 4));
    const rfqItems: DemoRfqItemRow[] = catalogItems.map((c, position) => {
      const raw = random.int(c.qty[0], c.qty[1]);
      const quantity = raw >= 100 ? Math.round(raw / 50) * 50 : raw;
      return {
        id: id(`rfq:${index}:item:${position}`),
        rfq_id: rfqId,
        position,
        name: c.name,
        description: c.description,
        quantity,
        unit: c.unit,
        created_at: iso(createdMs),
      };
    });
    data.rfq_items.push(...rfqItems);

    // Invitations — needs_review/awarded need a "risky" supplier in the mix
    const eligible = PERSONAS.filter((p) => p.categories.includes(category));
    let invited = random.shuffle(eligible).slice(0, Math.min(eligible.length, random.int(3, 5)));
    if ((stage === "needs_review" || stage === "awarded") && !invited.some((p) => p.risky)) {
      const risky = eligible.find((p) => p.risky);
      if (risky) invited = [...invited.slice(0, invited.length - 1), risky];
    }

    const invitedMs = createdMs + random.float(1, 6) * HOUR;
    const quotes: DraftQuote[] = [];

    invited.forEach((persona, slot) => {
      const inviteId = id(`rfq:${index}:invite:${persona.key}`);
      const invite: DemoInviteRow = {
        id: inviteId,
        rfq_id: rfqId,
        email: persona.email,
        company_name: persona.company,
        contact_name: persona.contact,
        token: tokenFor(tokenSecret, `${seed}:${buyerId}:${index}:${persona.key}`),
        status: stage === "draft" ? "pending" : "sent",
        invited_at: stage === "draft" ? null : iso(invitedMs),
        viewed_at: null,
        created_at: iso(createdMs),
        supplier_id: supplierIds.get(persona.key)!,
      };
      data.rfq_suppliers.push(invite);
      if (stage === "draft" || stage === "sent") {
        if (stage === "sent" && random.chance(0.5)) {
          invite.status = "viewed";
          invite.viewed_at = iso(Math.min(invitedMs + random.float(2, 20) * HOUR, nowMs - HOUR));
        }
        return;
      }

      const settledStage = stage !== "partially_replied";
      // Partially replied: the first one or two suppliers answered, the rest haven't.
      if (!settledStage && slot >= Math.max(1, Math.floor(invited.length / 2))) {
        invite.status = random.chance(0.5) ? "viewed" : "sent";
        if (invite.status === "viewed") invite.viewed_at = iso(Math.min(invitedMs + 3 * HOUR, nowMs - HOUR));
        return;
      }
      const mustReply = slot < 2; // every settled RFQ gets at least two quotes
      if (!mustReply && random.chance(persona.declineChance)) {
        invite.status = "declined";
        return;
      }

      const submittedMs = Math.min(invitedMs + random.float(...persona.responseDays) * DAY, nowMs - 2 * HOUR);
      const monthsIn = (submittedMs - start) / (30 * DAY);
      const quoteId = id(`rfq:${index}:quote:${persona.key}`);
      const source: DemoQuoteRow["source"] = random.pick(["form", "form", "email", "email", "manual"] as const);
      const items: DemoQuoteItemRow[] = rfqItems.map((item, position) => {
        const catalog = catalogItems[position];
        const missing = persona.missingItemChance > 0 && position > 0 && random.chance(persona.missingItemChance);
        const unit = missing
          ? null
          : round2(catalog.basePrice * (1 + catalog.drift * monthsIn) * persona.priceFactor * random.float(0.95, 1.05));
        return {
          id: id(`rfq:${index}:quote:${persona.key}:item:${position}`),
          quote_id: quoteId,
          rfq_item_id: item.id,
          unit_price: unit,
          total_price: unit === null ? null : round2(unit * item.quantity),
          notes: missing ? null : random.chance(0.12) ? "Equivalent brand offered" : null,
        };
      });
      const warranty = random.chance(persona.warrantyChance) ? random.pick(persona.warranties) : null;
      const row: DemoQuoteRow = {
        id: quoteId,
        rfq_id: rfqId,
        supplier_id: inviteId,
        source,
        status: source === "email" ? "confirmed" : "submitted",
        delivery_days: random.int(...persona.delivery),
        payment_terms: random.pick(persona.paymentTerms),
        warranty,
        notes: random.chance(0.2) ? "Prices valid for 14 days. Excluding VAT." : null,
        pdf_path: null,
        extraction_raw:
          source === "email"
            ? { confidence: random.pick(["high", "high", "medium"] as const), warnings: [], supplier_name: persona.company }
            : null,
        submitted_at: iso(submittedMs),
        confirmed_at: source === "email" ? iso(submittedMs + 2 * 60_000) : null,
        created_at: iso(submittedMs),
        updated_at: iso(submittedMs),
      };
      invite.status = "submitted";
      invite.viewed_at = iso(Math.max(invitedMs + 30 * 60_000, submittedMs - random.float(1, 8) * HOUR));
      quotes.push({ row, items, persona, invite });
    });

    if (stage === "draft" || stage === "sent" || stage === "partially_replied") {
      commit(quotes);
      return;
    }

    // ---- Settled stages: shape the numbers so the decision is genuine ----
    // Guarantee at least two complete quotes.
    for (const q of quotes.slice(0, 2)) {
      for (const qi of q.items) {
        if (qi.unit_price !== null) continue;
        const position = rfqItems.findIndex((i) => i.id === qi.rfq_item_id);
        const catalog = catalogItems[position];
        qi.unit_price = round2(catalog.basePrice * q.persona.priceFactor);
        qi.total_price = round2(qi.unit_price * rfqItems[position].quantity);
      }
    }

    const lastQuoteMs = Math.max(...quotes.map((q) => new Date(q.row.submitted_at).getTime()));
    const decidedMs = Math.min(lastQuoteMs + random.int(2, 9) * 60_000, nowMs - HOUR);
    const weights = { ...DEFAULT_WEIGHTS };
    let pick: DraftQuote;
    let decision: DemoAwardRow["decision"] | null = null;
    let reason: string | null = null;

    const wantsDiffers = (stage === "needs_review" || stage === "awarded") && index % 2 === 1;
    const wantsReview = (stage === "needs_review" || stage === "awarded") && !wantsDiffers;

    if (stage === "auto_approved" || stage === "compared") {
      // A compliant supplier wins on price.
      let target = quotes.find((q) => compliant(q) && quoteTotal(q) !== null);
      if (!target) {
        target = quotes.find((q) => quoteTotal(q) !== null)!;
        target.row.warranty = target.row.warranty ?? "12 months";
        target.row.delivery_days = Math.min(target.row.delivery_days, random.int(5, 12));
      }
      makeCheapest(target, quotes, rfqItems, random);
      pick = target;
      decision = stage === "auto_approved" ? "auto_approved" : null;
    } else if (wantsReview) {
      // The cheapest quote fails a rule (no warranty, or too slow) — the AI still picks it.
      const target = quotes.find((q) => q.persona.risky && quoteTotal(q) !== null) ?? quotes.find((q) => quoteTotal(q) !== null)!;
      if (compliant(target)) {
        if (target.persona.warrantyChance < 0.5) target.row.warranty = null;
        else target.row.delivery_days = random.int(Math.max(MAX_AUTO_DELIVERY_DAYS + 3, target.persona.delivery[0]), MAX_AUTO_DELIVERY_DAYS + 14);
      }
      makeCheapest(target, quotes, rfqItems, random);
      pick = target;
      decision = "review_needed";
      const issues: string[] = [];
      if (target.row.delivery_days > MAX_AUTO_DELIVERY_DAYS) issues.push(`delivery is ${target.row.delivery_days} days (must be ${MAX_AUTO_DELIVERY_DAYS} or less)`);
      if (!target.row.warranty) issues.push("no warranty provided");
      reason = `cheapest option has issues — ${issues.join("; ")}`;
    } else {
      // Differs: AI prefers a reliable, pricier supplier over a risky cheapest one.
      const reliable = quotes.find((q) => !q.persona.risky && compliant(q) && quoteTotal(q) !== null) ?? quotes[0];
      const cheap = quotes.find((q) => q !== reliable && quoteTotal(q) !== null) ?? quotes[1];
      if (cheap.persona.warrantyChance < 0.5) cheap.row.warranty = null;
      makeCheapest(cheap, quotes, rfqItems, random);
      if (!compliant(reliable)) {
        reliable.row.warranty = reliable.row.warranty ?? "24 months";
        reliable.row.delivery_days = Math.min(reliable.row.delivery_days, 9);
      }
      pick = reliable;
      decision = "differs_from_cheapest";
      reason = `recommended supplier is ${sar(quoteTotal(reliable)! - quoteTotal(cheap)!)} more than the cheapest quote`;
    }

    const cheapest = cheapestComplete(quotes)!;
    const autoGenerated = stage !== "compared";
    data.ai_recommendations.push({
      id: id(`rfq:${index}:recommendation`),
      rfq_id: rfqId,
      content: buildRecommendation(quotes, pick, weights),
      model: DEMO_MODEL,
      auto_generated: autoGenerated,
      created_at: iso(decidedMs),
    });
    if (!autoGenerated) {
      data.rfq_preferences.push({
        rfq_id: rfqId,
        weights: { price: 70, delivery: 40, warranty: 30, paymentTerms: 20 },
        has_deadline: false,
        deadline_date: null,
        max_budget: null,
        updated_at: iso(decidedMs),
      });
    }

    if (decision) {
      const approvedMs =
        stage === "auto_approved"
          ? decidedMs
          : stage === "awarded"
            ? Math.min(decidedMs + random.float(3, 40) * HOUR, nowMs - HOUR)
            : null;
      data.rfq_awards.push({
        rfq_id: rfqId,
        decision,
        recommended_supplier_id: pick.invite.id,
        recommended_quote_id: pick.row.id,
        cheapest_supplier_id: cheapest.q.invite.id,
        cheapest_quote_id: cheapest.q.row.id,
        reason,
        po_sent_at: approvedMs === null ? null : iso(approvedMs),
        created_at: iso(decidedMs),
      });
      const recent = nowMs - decidedMs < 21 * DAY;
      data.notifications.push({
        id: id(`rfq:${index}:notification`),
        buyer_id: buyerId,
        rfq_id: rfqId,
        type: decision === "auto_approved" ? "auto_approved" : decision,
        message:
          decision === "auto_approved"
            ? `Auto-approved: ${pick.invite.company_name} — PO sent`
            : stage === "awarded"
              ? `Approved: ${pick.invite.company_name} — PO sent`
              : `Review needed: ${reason}`,
        read_at: stage === "needs_review" || recent ? null : iso(decidedMs + 6 * HOUR),
        created_at: iso(decidedMs),
      });
    }

    commit(quotes);
  });

  function commit(quotes: DraftQuote[]) {
    for (const q of quotes) {
      data.quotes.push(q.row);
      data.quote_items.push(...q.items);
    }
  }

  return data;
}
