---
version: 1
slug: "src-app-marketing-page-tsx"
primary_target: "src/app/(marketing)/page.tsx"
related_targets: ["src/app/(marketing)/pricing/page.tsx"]
---

## Scope
The public landing page (/) and pricing (/pricing), for signed-out visitors, in Arabic and English with RTL. Visitor mode: Persuade.

## Audience and job
Owners and managers of Saudi SMBs (contractors, facilities, offices) deciding whether to try Clarix. The action they came to take is to open the live demo with no sign-up. The secondary actions are to create an account, or to join the waitlist on the pricing page.

## Proof on hand
- The demo workspace, which is working and labeled sample data.
- The product mechanism itself: rules decide approvals, quotes are ranked excluding VAT, and every decision has a trail.
- Synthetic eval results. No customers, logos, testimonials or real savings figures exist, and none may be invented.
- Pricing tiers are illustrative and must be labeled.

## Direction contract
THESIS: The page is a tender comparison sheet that decides itself. A visitor changes the approval rules and watches three sample quotes re-rank and get stamped "approved", or held for them. It refuses the category default: a headline and subcopy beside a dashboard screenshot, with three feature cards below.

OWN-WORLD:
- Ground: paper-white sheet with slate-950 ink and hairline slate rules.
- Figures: tabular Geist.
- Status colors: an ink-violet approval stamp (#5B4FD0, from the brand's #7C6FE0) is the only saturated mark; amber is reserved for "waiting for you".
- Arabic: IBM Plex Sans Arabic.
- No gradients and no cards-in-cards. Sheet rules, stamps and margin notes carry the structure.

STORY:
1. Visitors understand that Clarix compares every quote and approves the right one inside their rules.
2. They see that it happens in Arabic and English, with VAT handled.
3. They believe it because the sheet obeys them live.
4. They open the demo.

FIRST VIEWPORT:
- A thin top rule with the logo, nav (How it works, Pricing, FAQ), the language switch, Sign in, and Try the demo.
- The headline, about 4.5rem at start, then one line of subcopy and the working "Try the live demo" form button beside "Create an account".
- The sheet below, spanning the content width: a rules column at start (priority, delivery limit, warranty, spend limit), three ranked supplier rows, and a footer holding the stamp and the saving against the average of the other quotes.

FORM: comparison sheet with live approval rules, position 7 on my list (dealt lead), seed key dee89bc5. Rows re-rank in place, and a changed status stays lit until the next change. That raise comes from the declined boarding-pass and gate-board challenger.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction and motion
Rule changes re-rank the rows with a FLIP move (220ms, exponential ease-out). The stamp lands with a short scale-down "thunk" (160ms). With reduced motion, rows reorder without animation and the stamp appears in place.

## Unresolved
- Prices are illustrative.
- The waitlist stores leads only. There is no email follow-up yet.
