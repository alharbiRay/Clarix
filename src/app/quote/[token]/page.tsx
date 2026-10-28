import { cookies } from "next/headers";
import { CheckCircle2, Clock, FileQuestion } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { createAdminClient } from "@/lib/supabase/admin";
import { FadeIn } from "@/components/motion";
import { SupplierQuoteForm } from "@/components/supplier-quote-form";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { formatDate } from "@/lib/format";
import { dirOf, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { messagesFor, supplierLanguage, translatorFor } from "@/i18n/translator";
import type { Rfq, RfqItem, RfqSupplier } from "@/lib/types";

export const dynamic = "force-dynamic";
// Quote saves record a durable recommendation job and start it in the
// background with waitUntil (src/lib/jobs/schedule.ts), which runs within
// this function's time budget — give it room for a Gemini call.
export const maxDuration = 60;

/**
 * The supplier's page is in the SUPPLIER's language, not the buyer's: their
 * own choice on this page (cookie) → their saved preference → Arabic if
 * their name is in Arabic → the buyer's language.
 */
function PublicShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = translatorFor(locale, "supplierPortal");
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="Asia/Riyadh">
      <div lang={locale} dir={dirOf(locale)} className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-6 py-4">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">Clarix</span>
            <span className="ms-auto hidden text-xs text-slate-500 sm:inline">{t("portal")}</span>
            <LanguageSwitcher className="ms-2" />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}

function StatusCard({ icon: Icon, title, body }: { icon: typeof FileQuestion; title: string; body: string }) {
  return (
    <FadeIn className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Icon size={22} className="text-slate-500" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </FadeIn>
  );
}

export default async function SupplierQuotePage({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const chosen = cookies().get(LOCALE_COOKIE)?.value;

  const { data } = await supabase
    .from("rfq_suppliers")
    .select("*, suppliers(preferred_language), rfqs(*, rfq_items(*)), quotes(id)")
    .eq("token", params.token)
    .single();

  if (!data) {
    const locale: Locale = isLocale(chosen) ? chosen : "en";
    const t = translatorFor(locale, "supplierPortal");
    return (
      <PublicShell locale={locale}>
        <StatusCard icon={FileQuestion} title={t("invalidTitle")} body={t("invalidBody")} />
      </PublicShell>
    );
  }

  const supplier = data as unknown as RfqSupplier & {
    suppliers: { preferred_language: string | null } | null;
    rfqs: Rfq & { rfq_items: RfqItem[]; is_demo?: boolean };
    quotes: { id: string }[];
  };
  const rfq = supplier.rfqs;
  const items = [...rfq.rfq_items].sort((a, b) => a.position - b.position);

  const { data: buyer } = await supabase.from("profiles").select("locale, vat_rate").eq("id", rfq.buyer_id).maybeSingle();
  const locale: Locale = isLocale(chosen)
    ? chosen
    : supplierLanguage({
        preferred: supplier.suppliers?.preferred_language,
        companyName: supplier.company_name,
        contactName: supplier.contact_name,
        buyerLocale: buyer?.locale,
      });
  const t = translatorFor(locale, "supplierPortal");

  // Shared, read-only demo workspace: don't record a "view" or offer a form
  // that would only be refused on submit.
  if (rfq.is_demo) {
    return (
      <PublicShell locale={locale}>
        <StatusCard icon={FileQuestion} title={t("demoTitle")} body={t("demoBody", { title: rfq.title })} />
      </PublicShell>
    );
  }

  if (supplier.quotes.length > 0) {
    return (
      <PublicShell locale={locale}>
        <StatusCard icon={CheckCircle2} title={t("submittedTitle")} body={t("submittedBody", { title: rfq.title })} />
      </PublicShell>
    );
  }

  const deadlinePassed = rfq.deadline !== null && new Date(rfq.deadline).getTime() < Date.now();

  if (deadlinePassed || (rfq.status !== "sent" && rfq.status !== "draft")) {
    return (
      <PublicShell locale={locale}>
        <StatusCard
          icon={Clock}
          title={t("closedTitle")}
          body={deadlinePassed ? t("deadlinePassed", { date: formatDate(rfq.deadline, locale) }) : t("notAccepting")}
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
    <PublicShell locale={locale}>
      <FadeIn className="mb-8">
        <p className="text-xs font-medium text-slate-500">{t("eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          <bdi>{rfq.title}</bdi>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {rfq.project ? (
            <>
              <bdi>{rfq.project}</bdi>
              {" · "}
            </>
          ) : null}
          {t("deadline", { date: formatDate(rfq.deadline, locale) })} · {t("currency", { currency: rfq.currency })}
        </p>
        {rfq.description && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600" dir="auto">
            {rfq.description}
          </p>
        )}
      </FadeIn>

      <FadeIn delay={0.03}>
        <SupplierQuoteForm
          token={params.token}
          currency={rfq.currency}
          vatRate={Number(buyer?.vat_rate ?? 0.15)}
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
