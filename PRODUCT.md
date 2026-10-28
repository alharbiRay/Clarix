# Product

<!-- impeccable:product-schema 1 -->

> Written without an interview: the owner asked for the whole build to run unattended. Facts come
> from the codebase, the build brief and docs/. Lines marked *(inferred)* are reasonable readings
> not yet confirmed by the owner.

## Platform

web

## Users
- **Buyers at Saudi small and mid-sized businesses**: contractors, facilities and office managers,
  and procurement staff. They send requests for quotation (RFQs) to several suppliers, chase
  replies, compare the quotes and issue a purchase order. Often one person does procurement among
  other jobs *(inferred)*, working in Arabic and English, on desktop and phone.
- **Suppliers**: they receive an RFQ by email and answer through a form or by replying with a PDF.
  They have no account.
- **Evaluators** of the public site: owners and managers deciding whether to try Clarix.

## Product Purpose
Clarix turns the RFQ cycle from a spreadsheet and inbox chore into one flow:
1. Create an RFQ (by hand or pasted from text).
2. Invite suppliers by email.
3. Collect quotes from a form or an emailed PDF (AI extraction).
4. Compare them side by side with an AI recommendation.
5. Approve the award automatically when the account's rules allow, and send the PO.

Success means less time per RFQ and measurable savings against the average of the other quotes,
which the dashboard reports.

## Positioning
Arabic-first procurement for Saudi SMBs. It reads supplier PDFs in Arabic or English, ranks quotes
excluding VAT with VAT shown as its own line, auto-approves within rules the buyer sets, and keeps
a decision trail explaining every award. Generic RFQ tools are English-first and leave comparison
to spreadsheets.

## Operating Context
- RFQs are priced in SAR by default (other currencies allowed), and VAT is 15% by default.
- Suppliers reply by email with PDF quotes, often messy: Arabic-Indic digits, prices including
  VAT, line totals only.
- Buyers work in Arabic or English; the interface switches fully, including RTL.
- Approvals: auto-approval limits (delivery days, spend limit, minimum supplier score, warranty,
  cheapest-only). Anything outside them waits for the buyer, or a manager above the spend limit.

## Capabilities and Constraints
- **Built:**
  - RFQ creation with smart paste, supplier invitations and a supplier quote form.
  - Emailed PDF replies with Gemini extraction; manual quote entry.
  - Side-by-side comparison with price history and alerts; AI recommendation with buyer weights.
  - Configurable auto-approval and PO emails; negotiation email drafts that never leak competitor
    data.
  - Supplier scorecards, savings dashboard, reports with CSV and print, and a full audit trail.
  - Arabic and English with RTL; VAT lines.
  - A read-only demo workspace ("Try the demo", no sign-up).
- **Undecided:**
  - Pricing: no prices are set. Any tiers shown are illustrative and must be labeled as such.
  - Billing: there is no billing integration.
- **Not built:** WhatsApp, ERP integrations, multi-user teams beyond a manager role *(inferred
  from the code)*.

## Brand Commitments
- The name Clarix and the logo mark (`src/components/logo.tsx`, a two-ring mark).
- The product UI uses a slate neutral palette with a violet accent (#7C6FE0), Geist, and IBM Plex
  Sans Arabic for Arabic text.
- Bilingual parity: everything public exists in Arabic and English. Arabic is not a translation
  afterthought.

## Evidence on Hand
- **The demo workspace** (`scripts/seed-demo.ts`). A synthetic contractor, "Al Waha Contracting",
  with 25 RFQs, 7 suppliers and six months of decisions. It can be shown and must be labeled as
  sample data.
- **Extraction evals** (`docs/EVALS.md`). On 22 synthetic quotes, all 32 unit prices were correct
  on the cases the model answered. These are synthetic test results, not customer outcomes.
- **None of these exist:** customers, testimonials, logos, press, real savings figures, prices.
  None may be invented.

## Product Principles
1. **Show the decision, not just the data.** Every automatic step explains itself.
2. **Arabic-first, not Arabic-also.** Both languages are complete and correct, including numbers,
   VAT and direction.
3. **The buyer stays in control.** Automation runs inside limits the buyer sets, and everything
   else waits for them.
4. **Honest numbers.** Prices compare excluding VAT, savings are measured against real quotes, and
   illustrative material is labeled.

## Accessibility & Inclusion
WCAG 2.1 AA as the working bar *(inferred from existing practice)*: keyboard paths, labels, focus
rings, reduced motion respected (`MotionProvider`), and RTL correctness.
