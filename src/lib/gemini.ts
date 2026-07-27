import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import {
  extractionSchema,
  type ExtractionResult,
} from "@/lib/validations/quote";
import {
  rfqAutofillSchema,
  type RfqAutofillResult,
} from "@/lib/validations/rfq";

const MODEL = "gemini-2.5-flash";

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** Runs a Gemini structured-output call and validates the result against a zod schema. */
async function generateStructured<T>(
  client: GoogleGenAI,
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  responseSchema: Schema,
  zodSchema: z.ZodType<T>
): Promise<T> {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    const blockReason = response.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `The model declined to process this request (${blockReason}).`
        : "The model returned no output."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const result = zodSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Model output did not match the expected schema: ${result.error.message}`
    );
  }
  return result.data;
}

export interface ExtractionInput {
  pdfBase64: string;
  currency: string;
  supplier: { email: string; company_name: string | null };
  items: {
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
  }[];
}

const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    supplier_name: { type: Type.STRING, nullable: true },
    currency: { type: Type.STRING, nullable: true },
    delivery_days: { type: Type.INTEGER, nullable: true },
    payment_terms: { type: Type.STRING, nullable: true },
    warranty: { type: Type.STRING, nullable: true },
    notes: { type: Type.STRING, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rfq_item_id: { type: Type.STRING },
          unit_price: { type: Type.NUMBER, nullable: true },
          total_price: { type: Type.NUMBER, nullable: true },
          notes: { type: Type.STRING, nullable: true },
        },
        required: ["rfq_item_id", "unit_price", "total_price", "notes"],
      },
    },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "supplier_name",
    "currency",
    "delivery_days",
    "payment_terms",
    "warranty",
    "notes",
    "items",
    "confidence",
    "warnings",
  ],
};

/**
 * Extracts a supplier quote from a PDF into the shape of the RFQ's line
 * items. Returns a validated ExtractionResult (Gemini's response schema
 * constrains the shape; zod re-validates before it's trusted).
 */
export async function extractQuoteFromPdf(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const client = getClient();

  const itemsForPrompt = input.items.map((i) => ({
    rfq_item_id: i.id,
    name: i.name,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
  }));

  const prompt = `You are extracting a supplier quotation from the attached PDF for a procurement (RFQ) comparison tool.

The buyer requested quotes for these line items (RFQ currency: ${input.currency}):

${JSON.stringify(itemsForPrompt, null, 2)}

The quote was submitted by supplier "${input.supplier.company_name ?? input.supplier.email}" (${input.supplier.email}).

Extract the quote into the structured format:
- "items": include EVERY rfq_item_id from the list above, in the same order. Match each RFQ item to the corresponding line in the PDF by name/description — supplier wording often differs slightly. For each item:
  - "unit_price": the per-unit price in ${input.currency}. If the PDF only shows a line total, divide by the RFQ quantity. Use null if the item is not quoted at all.
  - "total_price": the extended line total. If only a unit price is shown, multiply by the RFQ quantity. Null if not quoted.
  - "notes": alternatives offered, brand/model quoted, lead time for that item, or null.
- "supplier_name": the company name as written in the PDF, or null.
- "currency": the currency the PDF actually quotes in (ISO code if identifiable), or null if unclear.
- "delivery_days": overall delivery/lead time converted to days (e.g. "2 weeks" → 14), or null.
- "payment_terms", "warranty", "notes": as stated in the PDF, or null.
- "confidence": "high" if the PDF is a clear quote matching the RFQ items; "medium" if some mapping required judgment; "low" if the document is hard to read or barely matches.
- "warnings": human-readable list of anything the buyer must check — e.g. quote currency differs from ${input.currency}, quantity in the PDF differs from the RFQ quantity, items in the PDF that match no RFQ item, unreadable pages, prices that look like they include/exclude tax ambiguously. Empty array if none.

Do not invent prices. If a value is not in the document, use null and add a warning.`;

  return generateStructured(
    client,
    [
      { inlineData: { mimeType: "application/pdf", data: input.pdfBase64 } },
      { text: prompt },
    ],
    EXTRACTION_RESPONSE_SCHEMA,
    extractionSchema
  );
}

// ---------------------------------------------------------------------------
// RFQ smart-paste autofill
// ---------------------------------------------------------------------------

const RFQ_AUTOFILL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, nullable: true },
    project: { type: Type.STRING, nullable: true },
    description: { type: Type.STRING, nullable: true },
    currency: { type: Type.STRING, nullable: true },
    deadline: { type: Type.STRING, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
        },
        required: ["name", "description", "quantity", "unit"],
      },
    },
    supplier_emails: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "title",
    "project",
    "description",
    "currency",
    "deadline",
    "items",
    "supplier_emails",
  ],
};

/**
 * Parses unstructured text (a pasted email, spec sheet, or notes) into the
 * shape of the New RFQ form — "smart paste" autofill. The caller decides
 * what to do with null/empty fields (typically: leave the user's existing
 * input untouched).
 */
export async function extractRfqFromText(text: string): Promise<RfqAutofillResult> {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are helping a buyer fill out an RFQ (request for quote) form from text they pasted — this could be an email, meeting notes, a message from a colleague, or a spec sheet excerpt. Today's date is ${today}.

Pasted text:
"""
${text}
"""

Extract the following, using null (or an empty array) for anything not present or not confidently inferable — do not invent information:
- "title": a short, specific RFQ title (e.g. "Office network equipment Q3"). If no explicit title is given, compose a reasonable one from the content; null only if the text has no discernible procurement request at all.
- "project": a project/initiative name if one is mentioned, else null.
- "description": any extra context, specs, or delivery details worth keeping that don't fit the line items below, else null.
- "currency": the ISO 4217 currency code (e.g. USD, EUR, GBP, SAR, AED) if a currency or price is mentioned or clearly implied, else null.
- "deadline": a response deadline as an ISO 8601 date (YYYY-MM-DD) if one is stated or clearly implied (resolve relative phrases like "by next Friday" or "within 2 weeks" against today's date), else null.
- "items": every distinct product or service being requested. For each: "name" (short), "description" (spec detail if given, else null), "quantity" (a number — default to 1 if not stated), "unit" (short unit like "pcs", "units", "boxes", "hours"; default "pcs"). Empty array if none are identifiable.
- "supplier_emails": any email addresses in the text that look like supplier/vendor contacts (not the buyer's own). Empty array if none.

Be conservative — only extract what's actually supported by the text.`;

  return generateStructured(
    client,
    [{ text: prompt }],
    RFQ_AUTOFILL_RESPONSE_SCHEMA,
    rfqAutofillSchema
  );
}

// ---------------------------------------------------------------------------
// AI recommendation
// ---------------------------------------------------------------------------

// Buyer-set priority weights (0-100 each, relative importance to one
// another — not required to sum to 100). Not part of Gemini's structured
// output: we attach them to the stored content ourselves so past
// recommendations (generated before this existed) still parse fine.
export const recommendationWeightsSchema = z.object({
  price: z.number().min(0).max(100),
  delivery: z.number().min(0).max(100),
  warranty: z.number().min(0).max(100),
  paymentTerms: z.number().min(0).max(100),
});

export type RecommendationWeights = z.infer<typeof recommendationWeightsSchema>;

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  price: 50,
  delivery: 50,
  warranty: 50,
  paymentTerms: 50,
};

// Buyer-set delivery deadline / budget constraints, captured alongside the
// priority weights. Also not part of Gemini's structured output — attached
// to the stored content ourselves, same as `weights`.
export const recommendationPreferencesSchema = z.object({
  hasDeadline: z.boolean(),
  deadlineDate: z.string().nullable(),
  maxBudget: z.number().nullable(),
});

export type RecommendationPreferences = z.infer<
  typeof recommendationPreferencesSchema
>;

export const recommendationContentSchema = z.object({
  recommendation: z.string(),
  reasoning: z.string(),
  ranking: z.array(
    z.object({
      supplier: z.string(),
      rank: z.number().int(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
    })
  ),
  risks: z.array(z.string()),
  weights: recommendationWeightsSchema.optional(),
  preferences: recommendationPreferencesSchema.optional(),
});

export type RecommendationContent = z.infer<typeof recommendationContentSchema>;

/** Renders weights as relative percentages for the prompt (falls back to an even split if all zero). */
export function describeWeights(weights: RecommendationWeights) {
  const total = weights.price + weights.delivery + weights.warranty + weights.paymentTerms;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 25);
  return [
    `Price: ${pct(weights.price)}%`,
    `Delivery speed: ${pct(weights.delivery)}%`,
    `Warranty: ${pct(weights.warranty)}%`,
    `Payment terms: ${pct(weights.paymentTerms)}%`,
  ].join(", ");
}

const RECOMMENDATION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    recommendation: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    ranking: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          supplier: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["supplier", "rank", "strengths", "weaknesses"],
      },
    },
    risks: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["recommendation", "reasoning", "ranking", "risks"],
};

export interface RecommendationInput {
  rfq: {
    title: string;
    description: string | null;
    currency: string;
    deadline: string | null;
  };
  weights: RecommendationWeights;
  preferences?: RecommendationPreferences;
  items: { name: string; quantity: number; unit: string }[];
  quotes: {
    supplier: string;
    source: "form" | "pdf" | "manual" | "email";
    total: number | null;
    delivery_days: number | null;
    payment_terms: string | null;
    warranty: string | null;
    notes: string | null;
    items: {
      item: string;
      unit_price: number | null;
      total_price: number | null;
      notes: string | null;
    }[];
  }[];
}

/** Renders deadline/budget constraints as a prompt paragraph, or "" if the buyer set neither. */
function describeConstraints(preferences: RecommendationPreferences | undefined) {
  if (!preferences) return "";
  const lines: string[] = [];
  if (preferences.hasDeadline && preferences.deadlineDate) {
    lines.push(
      `- The buyer needs the goods delivered by ${preferences.deadlineDate}. Treat any supplier whose delivery_days would miss this date (relative to today) as a significant risk, and weigh delivery speed accordingly even beyond the stated priority weight.`
    );
  }
  if (preferences.maxBudget !== null) {
    lines.push(
      `- The buyer's maximum budget is ${preferences.maxBudget}. Flag any supplier whose total exceeds this as a risk, and call it out clearly in the reasoning.`
    );
  }
  if (lines.length === 0) return "";
  return `\nThe buyer also set these hard constraints:\n${lines.join("\n")}\n`;
}

export async function generateQuoteRecommendation(
  input: RecommendationInput
): Promise<{ content: RecommendationContent; model: string }> {
  const client = getClient();

  const prompt = `You are a procurement analyst. A buyer collected supplier quotes for the RFQ below and needs a purchase recommendation.

RFQ:
${JSON.stringify(input.rfq, null, 2)}

The buyer's stated priorities for this decision (relative importance — weigh your recommendation, ranking, and reasoning accordingly; a criterion near 0% should barely factor in, one near 40%+ should visibly drive the recommendation):
${describeWeights(input.weights)}
${describeConstraints(input.preferences)}
Line items requested:
${JSON.stringify(input.items, null, 2)}

Quotes received (all prices in ${input.rfq.currency} unless a quote notes otherwise):
${JSON.stringify(input.quotes, null, 2)}

Produce:
- "recommendation": 1-3 sentences naming the supplier you recommend and the single most important reason, consistent with the buyer's stated priorities above. If splitting the order across suppliers is clearly better, say so.
- "reasoning": a concise paragraph weighing total price, per-item pricing, completeness (missing items), delivery time, payment terms, and warranty — in proportion to the buyer's priority weights, not evenly. Mention concrete numbers, and note explicitly when the priorities changed which supplier comes out ahead (e.g. cheapest isn't fastest).
- "ranking": every supplier, best first (rank 1 = best) according to the weighted priorities, each with specific strengths and weaknesses (e.g. "cheapest total at X", "missing a price for item Y", "longest warranty").
- "risks": things the buyer should verify before awarding — missing prices, currency mismatches, unusually low prices, vague terms, quotes still pending review, and any violation of the hard constraints above. Empty array only if there are genuinely none.

Be direct and specific. Do not pad with generic procurement advice.`;

  const content = await generateStructured(
    client,
    [{ text: prompt }],
    RECOMMENDATION_RESPONSE_SCHEMA,
    recommendationContentSchema
  );

  return {
    content: { ...content, weights: input.weights, preferences: input.preferences },
    model: MODEL,
  };
}
