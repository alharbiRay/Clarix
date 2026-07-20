import { CheckCircle2, Clock, FileQuestion } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { FadeIn } from "@/components/motion";
import { SupplierQuoteForm } from "@/components/supplier-quote-form";
import { formatDate } from "@/lib/format";
import type { Rfq, RfqItem, RfqSupplier } from "@/lib/types";

export const dynamic = "force-dynamic";

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-bold tracking-tight">Clarix</span>
          <span className="ml-auto text-xs text-slate-400">
            Supplier quote portal
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FileQuestion;
  title: string;
  body: string;
}) {
  return (
    <FadeIn className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Icon size={22} className="text-slate-500" />
      </div>
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </FadeIn>
  );
}

export default async function SupplierQuotePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("rfq_suppliers")
    .select("*, rfqs(*, rfq_items(*)), quotes(id)")
    .eq("token", params.token)
    .single();

  if (!data) {
    return (
      <PublicShell>
        <StatusCard
          icon={FileQuestion}
          title="Invalid link"
          body="This quote link doesn't exist or has been revoked. Please check the link in your invitation email."
        />
      </PublicShell>
    );
  }

  const supplier = data as unknown as RfqSupplier & {
    rfqs: Rfq & { rfq_items: RfqItem[] };
    quotes: { id: string }[];
  };
  const rfq = supplier.rfqs;
  const items = [...rfq.rfq_items].sort((a, b) => a.position - b.position);

  if (supplier.quotes.length > 0) {
    return (
      <PublicShell>
        <StatusCard
          icon={CheckCircle2}
          title="Quote already submitted"
          body={`Thank you — your quote for “${rfq.title}” has been received. The buyer will be in touch.`}
        />
      </PublicShell>
    );
  }

  const deadlinePassed =
    rfq.deadline !== null && new Date(rfq.deadline).getTime() < Date.now();

  if (deadlinePassed || (rfq.status !== "sent" && rfq.status !== "draft")) {
    return (
      <PublicShell>
        <StatusCard
          icon={Clock}
          title="This RFQ is closed"
          body={
            deadlinePassed
              ? `The deadline (${formatDate(rfq.deadline)}) for this request has passed.`
              : "This request is no longer accepting quotes."
          }
        />
      </PublicShell>
    );
  }

  // First open — record that the supplier viewed the invitation
  if (supplier.status === "sent" || supplier.status === "pending") {
    await supabase
      .from("rfq_suppliers")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", supplier.id);
  }

  return (
    <PublicShell>
      <FadeIn className="mb-8">
        <p className="text-xs font-medium text-slate-400">
          Request for quotation
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{rfq.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rfq.project ? `${rfq.project} · ` : ""}
          Deadline {formatDate(rfq.deadline)} · Currency {rfq.currency}
        </p>
        {rfq.description && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
            {rfq.description}
          </p>
        )}
      </FadeIn>

      <FadeIn delay={0.03}>
        <SupplierQuoteForm
          token={params.token}
          currency={rfq.currency}
          items={items.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
          }))}
        />
      </FadeIn>
    </PublicShell>
  );
}
