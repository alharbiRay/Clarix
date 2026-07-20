import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED"] as const;

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
