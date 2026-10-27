import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_POLICY, type ApprovalPolicy } from "@/lib/approval/rules";

interface PolicyRow {
  enabled: boolean;
  max_delivery_days: number;
  require_warranty: boolean;
  spend_limit: number | string | null;
  spend_limit_currency?: string | null;
  min_supplier_score: number | null;
  require_cheapest: boolean;
}

export function policyFromRow(row: PolicyRow): ApprovalPolicy {
  return {
    enabled: row.enabled,
    maxDeliveryDays: row.max_delivery_days,
    requireWarranty: row.require_warranty,
    spendLimit: row.spend_limit === null ? null : Number(row.spend_limit),
    spendLimitCurrency: row.spend_limit_currency ?? null,
    minSupplierScore: row.min_supplier_score,
    requireCheapest: row.require_cheapest,
  };
}

export function policyToRow(buyerId: string, p: ApprovalPolicy) {
  return {
    buyer_id: buyerId,
    enabled: p.enabled,
    max_delivery_days: p.maxDeliveryDays,
    require_warranty: p.requireWarranty,
    spend_limit: p.spendLimit,
    spend_limit_currency: p.spendLimit === null ? null : p.spendLimitCurrency,
    min_supplier_score: p.minSupplierScore,
    require_cheapest: p.requireCheapest,
  };
}

/**
 * The account's approval policy (migration 0013). Accounts created after the
 * backfill have no row yet: they get the defaults, honouring the legacy
 * profiles.auto_approval_enabled toggle.
 */
export async function loadApprovalPolicy(
  supabase: SupabaseClient,
  buyerId: string,
  legacyEnabled: boolean | null | undefined = true
): Promise<ApprovalPolicy> {
  const { data, error } = await supabase
    .from("approval_policies")
    .select("enabled, max_delivery_days, require_warranty, spend_limit, spend_limit_currency, min_supplier_score, require_cheapest")
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (error) throw new Error(`failed to load approval policy: ${error.message}`);
  if (data) return policyFromRow(data as PolicyRow);
  return { ...DEFAULT_POLICY, enabled: legacyEnabled !== false };
}
