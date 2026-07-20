import { z } from "zod";

export const quoteItemInputSchema = z.object({
  rfq_item_id: z.string().uuid(),
  unit_price: z.coerce
    .number()
    .min(0, "Price can't be negative")
    .nullable()
    .optional(),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const quoteSchema = z.object({
  items: z.array(quoteItemInputSchema).min(1),
  delivery_days: z.coerce
    .number()
    .int("Whole number of days")
    .min(0)
    .nullable()
    .optional(),
  payment_terms: z.string().trim().optional().or(z.literal("")),
  warranty: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type QuoteFormValues = z.infer<typeof quoteSchema>;

/** Shape returned by the Gemini PDF extraction (validated before use). */
export const extractionSchema = z.object({
  supplier_name: z.string().nullable(),
  currency: z.string().nullable(),
  delivery_days: z.number().int().nullable(),
  payment_terms: z.string().nullable(),
  warranty: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      rfq_item_id: z.string(),
      unit_price: z.number().nullable(),
      total_price: z.number().nullable(),
      notes: z.string().nullable(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;
