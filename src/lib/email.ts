import { getFromAddress, getResendClient } from "@/lib/resend";
import { formatDate, formatMoney } from "@/lib/format";
import { translatorFor } from "@/i18n/translator";
import type { Locale } from "@/i18n/config";

/** Logs the full Resend error (name/statusCode/message) before throwing — nothing else in this pipeline does. */
function throwOnError(
  context: string,
  error: { name: string; statusCode: number | null; message: string } | null
) {
  if (!error) return;
  console.error(`[email] ${context} failed:`, {
    name: error.name,
    statusCode: error.statusCode,
    message: error.message,
  });
  throw new Error(`${error.name}: ${error.message}`);
}

function wrapper(preheader: string, bodyHtml: string, locale: Locale = "en") {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const footer = translatorFor(locale, "emails")("footer");
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:1px;color:#f1f5f9;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
            <tr>
              <td style="background:#0f172a;padding:20px 28px;">
                <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.01em;">Clarix</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;text-align:${dir === "rtl" ? "right" : "left"};" dir="${dir}">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#94a3b8;">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string, primary = true) {
  const bg = primary ? "#0f172a" : "#ffffff";
  const color = primary ? "#ffffff" : "#0f172a";
  const border = primary ? "border:1px solid #0f172a;" : "border:1px solid #cbd5e1;";
  return `<a href="${url}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:${bg};color:${color};${border}font-size:14px;font-weight:600;text-decoration:none;">${label}</a>`;
}

interface RfqInvitationEmailInput {
  to: string;
  companyName: string | null;
  contactName: string | null;
  rfq: { title: string; currency: string; deadline: string | null };
  items: { name: string; quantity: number; unit: string }[];
  formUrl: string;
  replyToAddress: string;
  /** The supplier's language (see supplierLanguage in src/i18n/translator.ts). */
  language?: Locale;
}

export async function sendRfqInvitationEmail(input: RfqInvitationEmailInput) {
  const resend = getResendClient();
  const locale: Locale = input.language ?? "en";
  const t = translatorFor(locale, "emails.invitation");
  const end = locale === "ar" ? "left" : "right";
  const title = escapeHtml(input.rfq.title);
  const greetingName = escapeHtml(input.contactName || input.companyName || t("greetingFallback"));

  const itemRows = input.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${escapeHtml(i.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;text-align:${end};">${i.quantity} ${escapeHtml(i.unit)}</td>
      </tr>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">${t("greeting", { name: greetingName })}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
      ${t("intro", { title: `<strong>${title}</strong>` })}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;">${t("item")}</td>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-align:${end};">${t("quantity")}</td>
      </tr>
      ${itemRows}
    </table>
    <p style="margin:0 0 24px;padding:12px 16px;background:#fef3c7;border-radius:8px;font-size:14px;font-weight:600;color:#92400e;">
      ${t("deadline", { date: formatDate(input.rfq.deadline, locale) })} · ${t("currency", { currency: escapeHtml(input.rfq.currency) })}<br>
      <span style="font-weight:400;">${t("vatNote")}</span>
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-${end === "right" ? "right" : "left"}:10px;">${button(input.formUrl, t("submitForm"))}</td>
        <td>${button(`mailto:${input.replyToAddress}?subject=${encodeURIComponent(t("replySubject", { title: input.rfq.title }))}`, t("replyPdf"), false)}</td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
      ${t("replyHint")}
    </p>`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: t("subject", { title: input.rfq.title }),
    html: wrapper(t("preheader", { title }), body, locale),
    replyTo: input.replyToAddress,
  });

  throwOnError("sendRfqInvitationEmail", error);
}

interface PoConfirmationEmailInput {
  to: string;
  supplierLabel: string;
  rfqTitle: string;
  currency: string;
  items: { name: string; quantity: number; unit: string }[];
  /** Excluding VAT, as every quoted price is stored. */
  total: number | null;
  deliveryDays: number | null;
  warranty: string | null;
  /** The supplier's language. */
  language?: Locale;
  /** The buyer's VAT rate (fraction); adds VAT and total-incl.-VAT lines when > 0. */
  vatRate?: number;
}

/** Sent to the winning supplier when a quote is approved (automatically or by the buyer). */
export async function sendPoConfirmationEmail(input: PoConfirmationEmailInput) {
  const resend = getResendClient();
  const locale: Locale = input.language ?? "en";
  const t = translatorFor(locale, "emails.po");
  const end = locale === "ar" ? "left" : "right";
  const money = (n: number) => formatMoney(n, input.currency, locale);
  const title = escapeHtml(input.rfqTitle);
  const vatRate = input.vatRate ?? 0;
  const vat = input.total !== null && vatRate > 0 ? Math.round(input.total * vatRate * 100) / 100 : null;

  const itemRows = input.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${escapeHtml(i.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;text-align:${end};">${i.quantity} ${escapeHtml(i.unit)}</td>
      </tr>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">${t("greeting", { name: escapeHtml(input.supplierLabel) })}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
      ${t("intro", { title: `<strong>${title}</strong>` })}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;">${t("item")}</td>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-align:${end};">${t("quantity")}</td>
      </tr>
      ${itemRows}
    </table>
    <p style="margin:0 0 4px;font-size:15px;color:#0f172a;">
      <strong>${t("totalExVat", { total: input.total === null ? "—" : money(input.total) })}</strong>
    </p>
    ${
      vat !== null && input.total !== null
        ? `<p style="margin:0 0 4px;font-size:14px;color:#475569;">${t("vat", { rate: Math.round(vatRate * 1000) / 10, amount: money(vat) })}</p>
    <p style="margin:0 0 8px;font-size:14px;color:#0f172a;">${t("totalIncVat", { total: money(input.total + vat) })}</p>`
        : ""
    }
    <p style="margin:0 0 24px;font-size:13px;color:#475569;">
      ${t("terms", {
        delivery: input.deliveryDays === null ? "—" : t("days", { count: input.deliveryDays }),
        warranty: input.warranty ? escapeHtml(input.warranty) : "—",
      })}
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">${t("replyHint")}</p>`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: t("subject", { title: input.rfqTitle }),
    html: wrapper(t("preheader", { title }), body, locale),
  });

  throwOnError("sendPoConfirmationEmail", error);
}

interface AutoApprovalEmailInput {
  to: string;
  rfqTitle: string;
  supplierLabel: string;
  compareUrl: string;
  /** The buyer's language. */
  language?: Locale;
}

/** Buyer notification: the recommendation passed the account's approval rules and the PO went out. */
export async function sendAutoApprovalEmail(input: AutoApprovalEmailInput) {
  const resend = getResendClient();
  const locale: Locale = input.language ?? "en";
  const t = translatorFor(locale, "emails.autoApproved");
  const supplier = escapeHtml(input.supplierLabel);

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">${t("heading")}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      ${t("body", { supplier: `<strong>${supplier}</strong>`, title: `<strong>${escapeHtml(input.rfqTitle)}</strong>` })}
    </p>
    ${button(input.compareUrl, t("cta"))}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: t("subject", { supplier: input.supplierLabel, title: input.rfqTitle }),
    html: wrapper(t("preheader", { supplier }), body, locale),
  });

  throwOnError("sendAutoApprovalEmail", error);
}

interface ReviewNeededEmailInput {
  to: string;
  rfqTitle: string;
  /** Recorded by the approval engine (English sentence). */
  reason: string;
  compareUrl: string;
  /** The buyer's language. */
  language?: Locale;
}

/** Buyer's one and only notification for an RFQ when auto-approval doesn't clear it — sent by evaluateAutoApproval. */
export async function sendReviewNeededEmail(input: ReviewNeededEmailInput) {
  const resend = getResendClient();
  const locale: Locale = input.language ?? "en";
  const t = translatorFor(locale, "emails.reviewNeeded");
  const headline = t("headline", { reason: input.reason });

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;" dir="auto">${escapeHtml(headline)}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      ${t("body", { title: `<strong>${escapeHtml(input.rfqTitle)}</strong>` })}
    </p>
    ${button(input.compareUrl, t("cta"))}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: headline,
    html: wrapper(escapeHtml(headline), body, locale),
  });

  throwOnError("sendReviewNeededEmail", error);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface NegotiationEmailInput {
  to: string;
  /** The buyer's own address, so the supplier's answer goes straight to them. */
  replyTo: string | null;
  subject: string;
  body: string;
  language: "ar" | "en";
}

/**
 * A buyer's negotiation message to one supplier (Phase 8). The text was
 * checked by findPrivacyLeaks before this is called; it is sent as written,
 * HTML-escaped, right-to-left for Arabic.
 */
export async function sendNegotiationEmail(input: NegotiationEmailInput) {
  const resend = getResendClient();
  const dir = input.language === "ar" ? "rtl" : "ltr";
  const paragraphs = input.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#0f172a;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = wrapper(escapeHtml(input.subject), `<div dir="${dir}" style="text-align:${dir === "rtl" ? "right" : "left"};">${paragraphs}</div>`, input.language);

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html,
    text: input.body,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });

  throwOnError("sendNegotiationEmail", error);
}
