# Phase 12: Landing page and pricing

1. Direction (impeccable, Persuade mode, seed `dee89bc5`). The page is a tender comparison sheet
   that decides itself:
   - The visitor changes the approval rules (what the AI weighs, delivery limit, spend limit,
     warranty).
   - Three sample quotes re-rank in place, and the AI's pick is either stamped "approved" or held
     with the reason.
   - The world is the existing one: slate ink on white, the brand violet as the stamp ink, amber
     only for "waiting for you", Geist and IBM Plex Sans Arabic.
   - The contract is in `.impeccable/surfaces/src-app-marketing-page-tsx.md`, product facts in
     `PRODUCT.md`.
2. `/` for signed-out visitors (`src/app/(marketing)`); signed-in visitors go to `/dashboard`.
   The page, top to bottom:
   - Hero, then the live sheet.
   - How it works: one RFQ's four stops on one rule.
   - Features: extraction shown on a messy Arabic line, comparison and approval, the audit
     trail, Arabic-first.
   - A dashboard preview from the sample workspace, labeled.
   - FAQ (native `details`), and a closing call to action.
   - The primary action is the working demo form ("Explore the live demo", POST).
3. The sheet's logic (`src/lib/marketing/sample-sheet.ts`) is pure and tested.
   - Ranking is weighted like the recommendation (price, delivery, warranty).
   - Approval checks the pick against the rules, with the first failing rule as the reason.
   - The saving is measured against the average of the other quotes.
   - Rows move with FLIP (Web Animations, 260ms ease-out); the stamp lands in 180ms.
   - Reduced motion turns all of it off.
4. `/pricing`:
   - Three tiers on one ruled sheet, labeled illustrative. They list only capabilities that
     exist.
   - Waitlist form → `joinWaitlist`: zod validation, a per-IP rate limit (5 an hour), and the
     service-role insert into `leads` (0020: RLS, no policies, no API access).
   - No personal data in logs. A repeat email counts as done.
5. SEO:
   - Per-page metadata with canonical URLs, Open Graph and Twitter cards.
   - A generated share image (`opengraph-image.tsx`), `sitemap.ts` and `robots.ts` (the app,
     supplier links and APIs are disallowed). `metadataBase` comes from `NEXT_PUBLIC_APP_URL`.
   - Performance: no raster images on either page. The figures are HTML, the fonts are
     self-hosted, and both pages are under 130 kB first-load JS.
6. App-wide fix: Arabic text now renders in IBM Plex Sans Arabic. Geist's generated Arial fallback
   was catching Arabic glyphs first (`adjustFontFallback: false`).
