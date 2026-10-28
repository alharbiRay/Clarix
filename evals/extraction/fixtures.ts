/**
 * Labeled synthetic supplier quotes for the extraction evals. Messy on
 * purpose: Arabic and English, Arabic-Indic digits, VAT-inclusive prices,
 * line totals only, emails, tables, alternatives, missing items.
 *
 * Expected values follow the extraction prompt's rules: unit prices
 * EXCLUDING VAT, in the document's own currency (never converted), null when
 * the document doesn't give one. warrantyMonths is the period in months
 * (null = none stated).
 */
export interface EvalItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface EvalFixture {
  id: string;
  language: "en" | "ar" | "mixed";
  rfqCurrency: string;
  items: EvalItem[];
  text: string;
  expected: {
    unitPrices: Record<string, number | null>;
    currency: string | null;
    deliveryDays: number | null;
    warrantyMonths: number | null;
  };
}

export const FIXTURES: EvalFixture[] = [
  {
    id: "en-clean",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Cement bags 50kg", quantity: 100, unit: "bags" },
      { id: "i2", name: "Steel rebar 12mm", quantity: 2, unit: "tons" },
    ],
    text: `Quotation — Gulf Trading Est.
Item: Cement bags 50kg — 100 bags @ SAR 18.50 = SAR 1,850.00
Item: Steel rebar 12mm — 2 tons @ SAR 2,950 = SAR 5,900
Delivery: 7 days
Warranty: none
Prices exclude VAT.`,
    expected: { unitPrices: { i1: 18.5, i2: 2950 }, currency: "SAR", deliveryDays: 7, warrantyMonths: null },
  },
  {
    id: "ar-clean",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Portland cement", quantity: 100, unit: "bags" },
      { id: "i2", name: "Rebar 12mm", quantity: 2, unit: "tons" },
    ],
    text: `عرض سعر — مؤسسة النخبة للتجارة
أسمنت بورتلاندي: 18 ريال للكيس × 100 كيس
حديد تسليح 12 مم: 2900 ريال للطن × 2 طن
مدة التوريد: 5 أيام
الضمان: لا يوجد
الأسعار لا تشمل ضريبة القيمة المضافة`,
    expected: { unitPrices: { i1: 18, i2: 2900 }, currency: "SAR", deliveryDays: 5, warrantyMonths: null },
  },
  {
    id: "en-vat-inclusive",
    language: "en",
    rfqCurrency: "SAR",
    items: [{ id: "i1", name: "Ergonomic office chair", quantity: 10, unit: "pcs" }],
    text: `PRICE OFFER
All prices include 15% VAT.
Ergonomic office chair (mesh back) x10 — unit price 1,150.00 SAR (incl. VAT)
Delivery: 2 weeks
Warranty: 2 years`,
    expected: { unitPrices: { i1: 1000 }, currency: "SAR", deliveryDays: 14, warrantyMonths: 24 },
  },
  {
    id: "en-line-totals-only",
    language: "en",
    rfqCurrency: "USD",
    items: [
      { id: "i1", name: "Laptop 14-inch", quantity: 5, unit: "units" },
      { id: "i2", name: "27-inch monitor", quantity: 5, unit: "units" },
    ],
    text: `Laptop 14" i7/16GB (5 units) ............ total USD 4,250
Monitor 27" IPS (5 units) ................ total USD 1,100
Lead time: 3 weeks. 1 year warranty on all items.`,
    expected: { unitPrices: { i1: 850, i2: 220 }, currency: "USD", deliveryDays: 21, warrantyMonths: 12 },
  },
  {
    id: "ar-indic-digits",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Laser printer", quantity: 3, unit: "pcs" },
      { id: "i2", name: "Printer toner", quantity: 6, unit: "pcs" },
    ],
    text: `طابعة ليزر: ٨٥٠ ريال للوحدة (الكمية ٣)
حبر طابعة: ١٢٠ ريال للحبة (الكمية ٦)
التسليم خلال ١٠ أيام
ضمان سنة واحدة`,
    expected: { unitPrices: { i1: 850, i2: 120 }, currency: "SAR", deliveryDays: 10, warrantyMonths: 12 },
  },
  {
    id: "en-missing-item",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Packing tape 48mm", quantity: 1000, unit: "rolls" },
      { id: "i2", name: "Stretch film", quantity: 250, unit: "rolls" },
    ],
    text: `Prices in SAR, excluding VAT
Packing tape 48mm — 1000 rolls — 5.65 per roll
Stretch film — currently not available, cannot quote
Delivery 4 days
Warranty: N/A`,
    expected: { unitPrices: { i1: 5.65, i2: null }, currency: "SAR", deliveryDays: 4, warrantyMonths: null },
  },
  {
    id: "en-other-currency",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Safety helmet", quantity: 50, unit: "pcs" },
      { id: "i2", name: "Hi-vis safety vest", quantity: 50, unit: "pcs" },
    ],
    text: `All prices in AED, VAT excluded.
Safety helmets x50 — AED 35 each
Safety vests (hi-vis) x50 — AED 20 each
Delivery: 6 days
Warranty: 6 months against manufacturing defects`,
    expected: { unitPrices: { i1: 35, i2: 20 }, currency: "AED", deliveryDays: 6, warrantyMonths: 6 },
  },
  {
    id: "en-table",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "A4 paper box (5 reams)", quantity: 40, unit: "boxes" },
      { id: "i2", name: "Ballpoint pens box of 50", quantity: 20, unit: "boxes" },
    ],
    text: `| # | Description               | Qty | Unit Price | Amount   |
| 1 | A4 paper (box of 5 reams) | 40  | 95.00      | 3,800.00 |
| 2 | Ballpoint pens (box of 50)| 20  | 42.00      | 840.00   |
Subtotal 4,640.00
VAT 15% 696.00
Total SAR 5,336.00
Delivery: within 48 hours
Warranty: —`,
    expected: { unitPrices: { i1: 95, i2: 42 }, currency: "SAR", deliveryDays: 2, warrantyMonths: null },
  },
  {
    id: "mixed-names",
    language: "mixed",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Network switch 24-port", quantity: 2, unit: "pcs" },
      { id: "i2", name: "Cat6 cable box 305m", quantity: 5, unit: "boxes" },
    ],
    text: `السادة/ شركة الواحة للمقاولات المحترمين
نقدم لكم عرض أسعارنا كالتالي:
1- Cisco switch 24-port: 4,200 ر.س
2- Cat6 cable box 305m: 650 ر.س
التوريد: أسبوعين
الضمان: 3 سنوات على السويتش`,
    expected: { unitPrices: { i1: 4200, i2: 650 }, currency: "SAR", deliveryDays: 14, warrantyMonths: 36 },
  },
  {
    id: "en-per-box",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Nitrile gloves box of 100", quantity: 10, unit: "boxes" },
      { id: "i2", name: "Face masks box of 50", quantity: 10, unit: "boxes" },
    ],
    text: `Nitrile gloves — SAR 60 per box of 100
Face masks (3-ply) — SAR 25 per box of 50
Delivery: next day
No warranty applies to consumables.`,
    expected: { unitPrices: { i1: 60, i2: 25 }, currency: "SAR", deliveryDays: 1, warrantyMonths: null },
  },
  {
    id: "ar-vat-inclusive",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Split AC 24000 BTU", quantity: 4, unit: "units" },
      { id: "i2", name: "AC installation", quantity: 4, unit: "service" },
    ],
    text: `الأسعار شاملة ضريبة القيمة المضافة 15%
مكيف سبليت 24000 وحدة: 2,875 ريال
التركيب: 230 ريال للوحدة
التوريد والتركيب خلال 7 أيام
ضمان 5 سنوات على الكمبروسر`,
    expected: { unitPrices: { i1: 2500, i2: 200 }, currency: "SAR", deliveryDays: 7, warrantyMonths: 60 },
  },
  {
    id: "en-casual-email",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Diesel generator 20 kVA", quantity: 1, unit: "unit" },
      { id: "i2", name: "ATS panel", quantity: 1, unit: "unit" },
    ],
    text: `hi, thanks for the rfq. we can do the generator 20kva for 18,500 sar and the ats panel for 3,200 (both ex-vat). delivery about 3 weeks from po. 12 months warranty on both. regards, faisal`,
    expected: { unitPrices: { i1: 18500, i2: 3200 }, currency: "SAR", deliveryDays: 21, warrantyMonths: 12 },
  },
  {
    id: "en-discount",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Hard hat", quantity: 40, unit: "pcs" },
      { id: "i2", name: "Safety boots", quantity: 40, unit: "pairs" },
    ],
    text: `Item 1 Hard hats: 40 x SAR 30.00 = 1,200.00
Item 2 Safety boots: 40 x SAR 150.00 = 6,000.00
Less 5% discount on boots — net unit price after discount: SAR 142.50
Delivery 10 days. Warranty 3 months on boots.`,
    expected: { unitPrices: { i1: 30, i2: 142.5 }, currency: "SAR", deliveryDays: 10, warrantyMonths: 3 },
  },
  {
    id: "ar-weeks-months",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Water tank 5000 L", quantity: 2, unit: "pcs" },
      { id: "i2", name: "Water pump 1 HP", quantity: 2, unit: "pcs" },
    ],
    text: `خزان مياه 5000 لتر: 3,450 ريال للخزان
مضخة مياه 1 حصان: 780 ريال
مدة التوريد 3 أسابيع
ضمان 18 شهر`,
    expected: { unitPrices: { i1: 3450, i2: 780 }, currency: "SAR", deliveryDays: 21, warrantyMonths: 18 },
  },
  {
    id: "en-euro",
    language: "en",
    rfqCurrency: "EUR",
    items: [
      { id: "i1", name: "Bearing 6205-2RS", quantity: 200, unit: "pcs" },
      { id: "i2", name: "V-belt B-52", quantity: 40, unit: "pcs" },
    ],
    text: `Angebot / Quote No. 2026-118
Industrial bearing 6205-2RS: €4.80/pc (qty 200)
V-belt B-52: €11.20/pc (qty 40)
Lead time 15 working days
Warranty: 12 months`,
    expected: { unitPrices: { i1: 4.8, i2: 11.2 }, currency: "EUR", deliveryDays: 15, warrantyMonths: 12 },
  },
  {
    id: "en-partial-quantity",
    language: "en",
    rfqCurrency: "SAR",
    items: [{ id: "i1", name: "Stackable visitor chair", quantity: 100, unit: "pcs" }],
    text: `Re: RFQ visitor chairs
We can supply 80 (not 100) stackable visitor chairs at SAR 210 each, excl. VAT. The remaining 20 in a second batch.
Delivery: 12 days for the first batch.
Warranty: 1 year.`,
    expected: { unitPrices: { i1: 210 }, currency: "SAR", deliveryDays: 12, warrantyMonths: 12 },
  },
  {
    id: "en-lump-sum",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Door handles", quantity: 30, unit: "pcs" },
      { id: "i2", name: "Door hinges", quantity: 90, unit: "pcs" },
    ],
    text: `Dear buyer,
Total for all requested items: SAR 12,000 (excl. VAT). We do not break down prices per item.
Delivery: 2 days.`,
    expected: { unitPrices: { i1: null, i2: null }, currency: "SAR", deliveryDays: 2, warrantyMonths: null },
  },
  {
    id: "ar-chat",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Corrugated carton 40x30x30", quantity: 2000, unit: "pcs" },
      { id: "i2", name: "Adhesive tape roll", quantity: 300, unit: "rolls" },
    ],
    text: `السلام عليكم، سعر الكرتون المقوى 40×30×30 = 4.5 ريال للحبة، والشريط اللاصق 6 ريال للرول، الأسعار قبل الضريبة. نوصل خلال 3 أيام إن شاء الله`,
    expected: { unitPrices: { i1: 4.5, i2: 6 }, currency: "SAR", deliveryDays: 3, warrantyMonths: null },
  },
  {
    id: "en-both-prices",
    language: "en",
    rfqCurrency: "SAR",
    items: [{ id: "i1", name: "Fire extinguisher 6kg", quantity: 12, unit: "pcs" }],
    text: `Fire extinguisher 6kg dry powder
Qty: 12
Unit price (excl. VAT): 75.00 SAR
Unit price (incl. VAT): 86.25 SAR
Delivery: 1 week
Warranty: 1 year`,
    expected: { unitPrices: { i1: 75 }, currency: "SAR", deliveryDays: 7, warrantyMonths: 12 },
  },
  {
    id: "en-dollar-sign",
    language: "en",
    rfqCurrency: "USD",
    items: [
      { id: "i1", name: "Server rack 42U", quantity: 2, unit: "pcs" },
      { id: "i2", name: "PDU 16A", quantity: 4, unit: "pcs" },
    ],
    text: `Server rack 42U — $1,890.00 x 2
PDU 16A — $245.00 x 4
Shipping: 30 days
Warranty: 3-year limited`,
    expected: { unitPrices: { i1: 1890, i2: 245 }, currency: "USD", deliveryDays: 30, warrantyMonths: 36 },
  },
  {
    id: "ar-line-totals",
    language: "ar",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "Office chair", quantity: 20, unit: "pcs" },
      { id: "i2", name: "Office desk", quantity: 10, unit: "pcs" },
    ],
    text: `كراسي مكتبية (20 كرسي) الإجمالي 9,000 ريال
مكاتب (10 مكاتب) الإجمالي 12,500 ريال
الأسعار غير شاملة الضريبة
التوريد خلال 30 يوم
ضمان سنتين`,
    expected: { unitPrices: { i1: 450, i2: 1250 }, currency: "SAR", deliveryDays: 30, warrantyMonths: 24 },
  },
  {
    id: "en-alternative-brand",
    language: "en",
    rfqCurrency: "SAR",
    items: [
      { id: "i1", name: "LED panel 60x60 40W", quantity: 120, unit: "pcs" },
      { id: "i2", name: "LED tube T8 18W", quantity: 300, unit: "pcs" },
    ],
    text: `Item: LED panel 60x60 40W — Philips not available, offering Opple equivalent at SAR 78/pc (qty 120)
Item: LED tube T8 18W — SAR 14/pc (qty 300)
Delivery: 1 day from PO (ex-stock)
Warranty: 2 yrs`,
    expected: { unitPrices: { i1: 78, i2: 14 }, currency: "SAR", deliveryDays: 1, warrantyMonths: 24 },
  },
];
