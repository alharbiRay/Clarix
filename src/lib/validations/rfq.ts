import { z } from "zod";

export const CURRENCIES = ["SAR", "AED", "USD", "EUR", "GBP"] as const;

export const rfqItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit: z.string().trim().min(1, "Unit is required"),
});

export const rfqSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters"),
  project: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  currency: z.enum(CURRENCIES),
  deadline: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || new Date(v).getTime() > Date.now(),
      "Deadline must be in the future"
    ),
  items: z.array(rfqItemSchema).min(1, "Add at least one line item"),
  suppliers: z
    .array(z.string().email("Invalid email"))
    .min(1, "Add at least one supplier email")
    .refine(
      (emails) => new Set(emails.map((e) => e.toLowerCase())).size === emails.length,
      "Duplicate supplier emails"
    ),
});

export type RfqFormValues = z.infer<typeof rfqSchema>;

/** Shape returned by the Gemini "smart paste" RFQ autofill (validated before use). */
export const rfqAutofillSchema = z.object({
  title: z.string().nullable(),
  project: z.string().nullable(),
  description: z.string().nullable(),
  currency: z.string().nullable(),
  deadline: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      quantity: z.number().positive(),
      unit: z.string(),
    })
  ),
  supplier_emails: z.array(z.string()),
});

export type RfqAutofillResult = z.infer<typeof rfqAutofillSchema>;
