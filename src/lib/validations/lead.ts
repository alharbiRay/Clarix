import { z } from "zod";

export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export const TIERS = ["starter", "team", "business"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** The pricing-page waitlist form. Mirrors the checks on public.leads (0020). */
export const leadSchema = z.object({
  name: z.string().trim().min(1, "name").max(120, "name"),
  email: z.string().trim().toLowerCase().max(254, "email").email("email"),
  company: optionalText(160),
  teamSize: z.enum(TEAM_SIZES).optional().nullable(),
  tier: z.enum(TIERS).optional().nullable(),
  note: optionalText(1000),
});

export type LeadInput = z.input<typeof leadSchema>;
