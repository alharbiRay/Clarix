import { beforeEach, describe, expect, it, vi } from "vitest";

// Resend is mocked: tests never send email.
const send = vi.fn(async (_msg: { to: string; subject: string; html: string }) => ({ data: { id: "e1" }, error: null }));
vi.mock("@/lib/resend", () => ({
  getResendClient: () => ({ emails: { send } }),
  getFromAddress: () => "Clarix <rfq@example.test>",
}));

import {
  sendAutoApprovalEmail,
  sendPoConfirmationEmail,
  sendReviewNeededEmail,
  sendRfqInvitationEmail,
} from "@/lib/email";

const HOSTILE = `<script>alert(1)</script> & "Co"`;
const lastMessage = () => send.mock.calls.at(-1)![0];

function expectEscaped(html: string) {
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp;");
}

beforeEach(() => send.mockClear());

describe("RFQ invitation email", () => {
  const input = {
    to: "s@supplier.example",
    companyName: HOSTILE,
    contactName: null,
    rfq: { title: HOSTILE, currency: "SAR", deadline: "2026-11-01T00:00:00Z" },
    items: [{ name: HOSTILE, quantity: 3, unit: "pcs" }],
    formUrl: "https://app.example/quote/tok",
    replyToAddress: "rfq+tok@example.test",
  };

  it("escapes every value the buyer or supplier typed", async () => {
    await sendRfqInvitationEmail(input);
    expectEscaped(lastMessage().html);
  });

  it("is written right to left in Arabic", async () => {
    await sendRfqInvitationEmail({ ...input, language: "ar" });
    expect(lastMessage().html).toMatch(/<html[^>]*lang="ar"[^>]*dir="rtl"|<html[^>]*dir="rtl"[^>]*lang="ar"/);
  });
});

describe("PO confirmation email", () => {
  const input = {
    to: "s@supplier.example",
    supplierLabel: HOSTILE,
    rfqTitle: HOSTILE,
    currency: "SAR",
    items: [{ name: "Cement", quantity: 10, unit: "bags" }],
    total: 1000,
    deliveryDays: 5,
    warranty: HOSTILE,
  };

  it("adds VAT and the total including VAT", async () => {
    await sendPoConfirmationEmail({ ...input, vatRate: 0.15 });
    const { html } = lastMessage();
    expectEscaped(html);
    expect(html).toContain("Total (excl. VAT): SAR 1,000.00");
    expect(html).toContain("VAT (15%): SAR 150.00");
    expect(html).toContain("Total incl. VAT: SAR 1,150.00");
  });

  it("shows a two-decimal rate as saved", async () => {
    await sendPoConfirmationEmail({ ...input, vatRate: 0.0725 });
    expect(lastMessage().html).toContain("VAT (7.25%)");
  });

  it("leaves VAT out when the rate is 0 or the total is unknown", async () => {
    await sendPoConfirmationEmail({ ...input, vatRate: 0 });
    expect(lastMessage().html).not.toContain("VAT (");
    await sendPoConfirmationEmail({ ...input, total: null, vatRate: 0.15 });
    expect(lastMessage().html).not.toContain("VAT (");
  });

  it("goes out in the supplier's language", async () => {
    await sendPoConfirmationEmail({ ...input, language: "ar", vatRate: 0.15 });
    const { html, subject } = lastMessage();
    expect(subject).toContain("تأكيد أمر شراء");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("ضريبة القيمة المضافة (15٪)");
  });
});

describe("buyer notification emails", () => {
  it("auto-approved: escaped, in the buyer's language", async () => {
    await sendAutoApprovalEmail({ to: "b@buyer.example", rfqTitle: HOSTILE, supplierLabel: HOSTILE, compareUrl: "https://app.example/c", language: "ar" });
    const { html } = lastMessage();
    expectEscaped(html);
    expect(html).toContain("تم الاعتماد تلقائيًا.");
    expect(html).toContain('dir="rtl"');
  });

  it("review needed: escapes the reason and the title", async () => {
    await sendReviewNeededEmail({ to: "b@buyer.example", rfqTitle: HOSTILE, reason: HOSTILE, compareUrl: "https://app.example/c" });
    const { html, subject } = lastMessage();
    expectEscaped(html);
    expect(subject).toBe(`Review needed: ${HOSTILE}`);
  });
});
