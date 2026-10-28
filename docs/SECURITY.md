# Security

How Clarix keeps each buyer's data private, and what the Phase 11 security pass checked
(2026-10-28).

## Data access

- **Row-level security on every table.** All 16 public tables have RLS enabled. Each buyer-data
  policy is scoped to `auth.uid()`, either directly (`buyer_id = auth.uid()`) or through the parent
  RFQ. Anonymous visitors match no policy and get no rows.
  - Two tables have no policies on purpose: `rate_limit_events` and `public_rate_limit_events`.
    They are only touched through `SECURITY DEFINER` functions, and table access is revoked from
    `anon` and `authenticated`.
- **The demo account is read-only at the database.** Restrictive policies (`NOT is_demo_account()`)
  block every insert, update and delete, whatever the app does.
- **Column-level update grants on `profiles`** cover only the fields a buyer may change: name,
  settings, language and VAT rate. Buyers can't change their role or demo flag.
- **Quote PDFs** live in a private bucket.
  - Reads and uploads are limited to the buyer who owns the RFQ (the folder is the RFQ id).
  - Since 0018, Storage itself also enforces the limits: 10 MB and `application/pdf`.

## Server-side authorization

Every server action checks the session on the server (`requireWritableUser` or
`auth.getUser()`) before doing anything, then queries through the RLS-scoped client. Four actions
are public by design:

| Action | Why public | Protection |
| --- | --- | --- |
| `submitQuote` | The supplier has no account | Unguessable 48-hex token (format-checked before any query); rate limited per IP and per token; RFQ status, deadline and duplicate checks; zod validation |
| `setQuoteLocale` | Supplier page language | Sets its own cookie only; touches no data |
| `startDemoSession` | "Try the demo" | POST-only form action; rate limited per IP |
| `exitDemoToSignup` | Leaving the demo | Ends only this browser's session |

The service-role client is used only where no user session exists: the supplier form, the
Resend webhook, background jobs and the demo entry.

## Public endpoints

- **Resend inbound webhook.** The svix signature is verified before anything else, and bad
  signatures get 401. The recipient token picks the invitation, and the slow work runs in a
  retrying job.
- **Job runner (`/api/jobs/process`).** Requires `CRON_SECRET` as a bearer token.
- **Rate limits** (migration 0019). Limits are fixed in the database. Keys are SHA-256 hashes, so
  raw IPs and tokens are never stored. Only the service role can call the function.

  | Action | Limit |
  | --- | --- |
  | Quote submissions per IP | 30 an hour |
  | Quote submissions per link | 10 an hour |
  | Demo sessions per IP | 20 an hour |

  If the check itself fails, the request is allowed and the failure is logged, so a database
  hiccup never blocks a supplier's quote.
- **Signed-in AI actions.** Negotiation drafts and sends are limited per account (0015/0016).

## Input handling

- **Validation.** All form input goes through zod on the server. Supplier and buyer text is
  HTML-escaped in every email.
- **PDFs.** Size (10 MB) and the `%PDF-` magic bytes are checked on every path (buyer upload and
  emailed reply) before Gemini or Storage sees the file. The declared content type isn't trusted.
- **Search.** User text in PostgREST filters is quoted and escaped (`ilikeAnyFilter`), so it can't
  add filter conditions.
- **AI output.**
  - Gemini output is validated with zod, gets one repair attempt, and otherwise falls back to
    manual entry.
  - Negotiation prompts carry no competitor data, and the final text is checked for leaks.
- **CSV exports** guard against formula injection and are built from RLS-scoped queries.

## Secrets

- Secrets live only in Vercel and GitHub settings. `.env.example` lists names, never values.
- Tests blank every credential (`src/test/setup.ts`) and mock Gemini and Resend, so CI needs no
  secrets.

## Supabase advisor notices (accepted)

- **"SECURITY DEFINER function executable by authenticated" for `consume_rate_limit`.**
  Intentional: buyers call it, and the limits are fixed inside it (0016).
- **The same notice for `is_demo_account`.** Intentional: policies call it, and it reveals only
  the caller's own flag.
- **"RLS enabled, no policy" on `rate_limit_events`.** Intentional, as described above.
- **Leaked-password protection disabled.** The owner needs to turn this on in Supabase Auth
  settings.
