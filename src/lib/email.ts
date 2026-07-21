import { getFromAddress, getResendClient } from "@/lib/resend";
import { formatDate, formatMoney } from "@/lib/format";

function wrapper(preheader: string, bodyHtml: string) {
  return `<!doctype html>
<html>
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
              <td style="padding:28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#94a3b8;">Sent by Clarix — an RFQ &amp; quote comparison tool.</p>
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
}

export async function sendRfqInvitationEmail(input: RfqInvitationEmailInput) {
  const resend = getResendClient();
  const greetingName = input.contactName || input.companyName || "there";

  const itemRows = input.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${i.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;text-align:right;">${i.quantity} ${i.unit}</td>
      </tr>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Hi ${greetingName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155;">
      You've been invited to quote on <strong>${input.rfq.title}</strong>. Please review the items below and submit your pricing.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Item</td>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;text-align:right;">Quantity</td>
      </tr>
      ${itemRows}
    </table>
    <p style="margin:0 0 24px;padding:12px 16px;background:#fef3c7;border-radius:8px;font-size:14px;font-weight:600;color:#92400e;">
      Deadline: ${formatDate(input.rfq.deadline)} · Currency: ${input.rfq.currency}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:10px;">${button(input.formUrl, "Submit via form")}</td>
        <td>${button(`mailto:${input.replyToAddress}?subject=${encodeURIComponent(`Quote for ${input.rfq.title}`)}`, "Reply with PDF", false)}</td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
      Prefer email? Just reply to this message with your quote as a PDF attachment.
    </p>`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: `New RFQ from Clarix: ${input.rfq.title}`,
    html: wrapper(`You're invited to quote on ${input.rfq.title}`, body),
    replyTo: input.replyToAddress,
  });

  if (error) throw new Error(error.message);
}

interface QuoteReceivedEmailInput {
  to: string;
  rfqTitle: string;
  supplierLabel: string;
  reviewUrl: string;
}

export async function sendQuoteReceivedEmail(input: QuoteReceivedEmailInput) {
  const resend = getResendClient();

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">A supplier emailed in a quote.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#334155;">
      <strong>${input.supplierLabel}</strong> replied to your invitation for <strong>${input.rfqTitle}</strong> with a PDF. We extracted the pricing automatically — please review and confirm it before it counts toward the comparison.
    </p>
    ${button(input.reviewUrl, "Review extracted quote")}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: `New quote received by email: ${input.rfqTitle}`,
    html: wrapper(`${input.supplierLabel} emailed in a quote for ${input.rfqTitle}`, body),
  });

  if (error) throw new Error(error.message);
}

interface ComparisonReadyEmailInput {
  to: string;
  rfqTitle: string;
  compareUrl: string;
}

export async function sendComparisonReadyEmail(input: ComparisonReadyEmailInput) {
  const resend = getResendClient();

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Your comparison is ready.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#334155;">
      All suppliers invited to <strong>${input.rfqTitle}</strong> have submitted their quotes. We generated an AI recommendation to help you decide.
    </p>
    ${button(input.compareUrl, "View comparison")}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: `Your comparison for ${input.rfqTitle} is ready`,
    html: wrapper(`Your comparison for ${input.rfqTitle} is ready`, body),
  });

  if (error) throw new Error(error.message);
}

interface PoConfirmationEmailInput {
  to: string;
  supplierLabel: string;
  rfqTitle: string;
  currency: string;
  items: { name: string; quantity: number; unit: string }[];
  total: number | null;
  deliveryDays: number | null;
  warranty: string | null;
}

/** Sent automatically to the winning supplier when the auto-approval rules engine clears a quote. */
export async function sendPoConfirmationEmail(input: PoConfirmationEmailInput) {
  const resend = getResendClient();

  const itemRows = input.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${i.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;text-align:right;">${i.quantity} ${i.unit}</td>
      </tr>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Hi ${input.supplierLabel},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155;">
      Good news — your quote for <strong>${input.rfqTitle}</strong> has been selected. This email confirms the purchase order; formal PO paperwork will follow from the buyer.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Item</td>
        <td style="padding-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;text-align:right;">Quantity</td>
      </tr>
      ${itemRows}
    </table>
    <p style="margin:0 0 8px;font-size:15px;color:#0f172a;">
      <strong>Total: ${input.total === null ? "—" : formatMoney(input.total, input.currency)}</strong>
    </p>
    <p style="margin:0 0 24px;font-size:13px;color:#475569;">
      Delivery: ${input.deliveryDays === null ? "—" : `${input.deliveryDays} days`} · Warranty: ${input.warranty || "—"}
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      Reply to this email if anything above doesn't match your quote.
    </p>`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: `Purchase order confirmation: ${input.rfqTitle}`,
    html: wrapper(`Your quote for ${input.rfqTitle} has been selected`, body),
  });

  if (error) throw new Error(error.message);
}

interface AutoApprovalEmailInput {
  to: string;
  rfqTitle: string;
  supplierLabel: string;
  compareUrl: string;
}

/** Buyer notification for Rule 1 — the winning quote was auto-approved and the PO was sent. */
export async function sendAutoApprovalEmail(input: AutoApprovalEmailInput) {
  const resend = getResendClient();

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Auto-approved.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#334155;">
      <strong>${input.supplierLabel}</strong> was the cheapest complete quote for <strong>${input.rfqTitle}</strong>, met your delivery and warranty requirements, and matched the AI recommendation — so we sent them a PO confirmation automatically.
    </p>
    ${button(input.compareUrl, "View comparison")}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: `Auto-approved: ${input.supplierLabel} — PO sent for ${input.rfqTitle}`,
    html: wrapper(`Auto-approved: ${input.supplierLabel} — PO sent`, body),
  });

  if (error) throw new Error(error.message);
}

interface ReviewNeededEmailInput {
  to: string;
  rfqTitle: string;
  reason: string;
  /** true when the recommended supplier differs from the cheapest (Rule 3); false when it's the cheapest but failed a check (Rule 2). */
  differs: boolean;
  compareUrl: string;
}

/** Buyer notification for Rules 2 & 3 — something needs a human decision before awarding. */
export async function sendReviewNeededEmail(input: ReviewNeededEmailInput) {
  const resend = getResendClient();
  const headline = input.differs
    ? "Recommendation differs from cheapest — approval required"
    : `Review needed: cheapest option has issues — ${input.reason}`;

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">${headline}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#334155;">
      <strong>${input.rfqTitle}</strong> wasn't auto-approved — ${input.reason}. Take a look and decide who to award.
    </p>
    ${button(input.compareUrl, "Review comparison")}`;

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: headline,
    html: wrapper(headline, body),
  });

  if (error) throw new Error(error.message);
}
