export type RfqStatus = "draft" | "sent" | "closed" | "awarded";
export type SupplierInviteStatus =
  | "pending"
  | "sent"
  | "viewed"
  | "submitted"
  | "declined";
export type QuoteSource = "form" | "pdf" | "manual" | "email";
export type QuoteStatus = "submitted" | "needs_review" | "confirmed" | "rejected";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
}

export interface Rfq {
  id: string;
  buyer_id: string;
  title: string;
  project: string | null;
  description: string | null;
  currency: string;
  deadline: string | null;
  status: RfqStatus;
  created_at: string;
  updated_at: string;
}

export interface RfqItem {
  id: string;
  rfq_id: string;
  position: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
}

export interface RfqSupplier {
  id: string;
  rfq_id: string;
  email: string;
  company_name: string | null;
  contact_name: string | null;
  token: string;
  status: SupplierInviteStatus;
  invited_at: string | null;
  viewed_at: string | null;
}

export interface Quote {
  id: string;
  rfq_id: string;
  supplier_id: string;
  source: QuoteSource;
  status: QuoteStatus;
  delivery_days: number | null;
  payment_terms: string | null;
  warranty: string | null;
  notes: string | null;
  pdf_path: string | null;
  extraction_raw: unknown;
  submitted_at: string;
  confirmed_at: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  rfq_item_id: string;
  unit_price: number | null;
  total_price: number | null;
  notes: string | null;
}

export interface RfqPreferences {
  rfq_id: string;
  weights: { price: number; delivery: number; warranty: number; paymentTerms: number };
  has_deadline: boolean;
  deadline_date: string | null;
  max_budget: number | null;
  updated_at: string;
}

export interface Notification {
  id: string;
  buyer_id: string;
  rfq_id: string;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}
