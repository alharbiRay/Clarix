---
name: Clarix
description: Arabic-first procurement for Saudi SMBs; quotes compared, ranked and approved inside the buyer's rules.
colors:
  brand-violet: "#7C6FE0"
  stamp-violet: "#5B4FD0"
  approval-ink: "#4338CA"
  approval-tint: "rgb(124 111 224 / 0.08)"
  pick-tint: "rgb(124 111 224 / 0.06)"
  ink: "#020617"
  ink-hover: "#1E293B"
  text-strong: "#334155"
  text-body: "#475569"
  text-muted: "#64748B"
  page-ground: "#F8FAFC"
  sheet-white: "#FFFFFF"
  rule-hairline: "#E2E8F0"
  rule-row: "#F1F5F9"
  rule-control: "#CBD5E1"
  waiting-ink: "#92400E"
  waiting-ink-deep: "#78350F"
  waiting-mark: "#D97706"
  waiting-ground: "#FFFBEB"
  waiting-rule: "#FCD34D"
typography:
  display:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 4.6vw, 4.1rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.038em"
  headline:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.2vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "\"ss01\", \"cv11\""
  label:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.25
  figure:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "\"tnum\""
  stamp:
    fontFamily: "Geist, IBM Plex Sans Arabic, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.14em"
rounded:
  stamp: "4px"
  md: "6px"
  sheet: "12px"
  full: "9999px"
spacing:
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "32px"
  sheet-x-sm: "20px"
  sheet-x: "28px"
  section-y-sm: "80px"
  section-y: "112px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.figure}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-primary-sm:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.page-ground}"
  input-field:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  segmented-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-white}"
    typography: "{typography.label}"
    rounded: "5px"
  decision-sheet:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  decision-bar-approved:
    backgroundColor: "{colors.approval-tint}"
    textColor: "{colors.approval-ink}"
  decision-bar-held:
    backgroundColor: "{colors.waiting-ground}"
    textColor: "{colors.waiting-ink-deep}"
  approval-stamp:
    textColor: "{colors.stamp-violet}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    padding: "4px 10px"
  approval-chip:
    backgroundColor: "{colors.approval-tint}"
    textColor: "{colors.approval-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Clarix

## Overview

**Creative North Star: "The Sheet That Decides"**

Clarix looks like a tender comparison sheet: white paper laid on a cool slate ground, slate-950 ink, hairline rules between rows and a heavy 2px rule where a new section of the document opens. Structure comes from rules, columns and margin notes, never from stacked cards or decoration. The density is the density of a working document: figures sit in tabular columns, labels are small and plain, headings are short and heavy.

Colour is almost absent, which is what makes the two status inks legible. Violet is the brand and the mark of approval; at its stamp strength it appears only where something has been decided in the buyer's favour. Amber marks the opposite: a value that breaks a rule, or a decision waiting for the buyer. Everything else is slate.

The system is bilingual by construction. Geist sets Latin text and figures, IBM Plex Sans Arabic sets Arabic, both in the same stack, and every layout uses logical properties so Arabic mirrors without a second stylesheet. Numbers stay Western and left-to-right in both languages.

**Key Characteristics:**
- Paper-white sheets on a slate-50 ground, ruled rather than boxed.
- One saturated mark (the violet approval stamp); amber only for "waiting for you".
- Geist with tight negative tracking in LTR; Plex Sans Arabic with no tracking in RTL.
- Tabular figures everywhere money or counts line up; money written "SAR 12,345".
- Motion only states a decision: rows glide to a new rank, the stamp lands, the decision bar lights.

## Colors

A slate document palette with one violet voice for approval and one amber voice for exceptions.

### Primary
- **Clarix Violet** (brand-violet): the logo, focus rings on every interactive element, text selection, the underline marking values Clarix read from a quote, and low-alpha tints (pick-tint on the top-ranked row, approval-tint behind an approved decision). Never used as text: it is too light on white.
- **Stamp Violet** (stamp-violet): the ink of approval. The ruled stamp border, the filled check disc, the "AI pick" note, check marks in pricing lists, the final dot on the audit trail, and the row rank that just moved.
- **Approval Ink** (approval-ink): text inside approval states ("Auto-approved", approved chips, "Auto" tags), where it needs more contrast than stamp violet on a violet tint.

### Secondary
- **Waiting Amber** (waiting-ink, waiting-ink-deep, waiting-mark, waiting-ground, waiting-rule): a value over the buyer's limit (spend, delivery days, missing warranty) in waiting-ink; the held decision bar on waiting-ground with a waiting-rule top border, waiting-mark clock disc and waiting-ink-deep lead word; form errors and invalid-field borders.

### Neutral
- **Ink** (ink): headings, figures, primary buttons, the active segment, the 2px section rule and the sheet-header rule.
- **Ink Hover** (ink-hover): primary button hover.
- **Strong / Body / Muted text** (text-strong, text-body, text-muted): secondary figures and list items; paragraphs and ledes; column headers, captions and notes.
- **Page Ground** (page-ground): the page behind the sheets, and the rules margin of the decision sheet (at 70%).
- **Sheet White** (sheet-white): sheets, the header bar, alternating full-width bands (Features, FAQ, footer).
- **Hairline / Row / Control rules** (rule-hairline, rule-row, rule-control): section and column dividers; row separators inside a sheet; borders on inputs, steppers and secondary buttons.

### Named Rules
**The Stamp Means Approval Rule.** Stamp violet at full strength marks something decided in the buyer's favour, and only that. It is never a decorative accent, a link colour or a heading colour.

**The Amber Is A Question Rule.** Amber appears only where a value breaks a rule or a decision is waiting for the buyer. It is never a warning-flavoured highlight for emphasis.

**The No Gradient Rule.** Surfaces are flat colour. Tints are alpha over white, never gradients.

## Typography

**Display Font:** Geist (variable, 100 to 900)
**Body Font:** Geist, with IBM Plex Sans Arabic for Arabic glyphs in the same stack
**Label/Mono Font:** Geist Mono is loaded but not part of the public surface

**Character:** Geist is neutral and geometric, set heavy and tight for headlines; Plex Sans Arabic matches its tone so the two languages read as one voice. Geist loads without a generated fallback (`adjustFontFallback: false`) so Arabic text reaches Plex Arabic instead of a size-matched Arial.

### Hierarchy
- **Display** (600, clamp 2.1 to 4.1rem, 1.02; 1.2 in RTL): the one page headline. Pricing uses a smaller step (clamp 2.2 to 3.6rem, 1.05).
- **Headline** (600, clamp 1.75 to 2.6rem, 1.1): section titles, balanced wrap.
- **Title** (600, 1.25rem): sub-feature titles; 1.125rem for steps and tier names.
- **Body** (400, 1rem, 1.625): paragraphs at 34 to 62ch; ledes step to 1.125rem, the hero lede to 1.15rem at 68ch.
- **Label** (500, 0.8rem): control labels and segment text; column headers drop to 0.7rem in text-muted. Labels are sentence case.
- **Figure** (600, 0.95rem, tabular): totals, stepper values; prices display at 2.4rem, rank numerals at 1.5rem.
- **Stamp** (700, 0.8rem, uppercase, 0.14em tracking in LTR, none in RTL): the word inside the approval stamp only.

### Named Rules
**The LTR-Only Tracking Rule.** Negative tracking (-0.02 to -0.038em) applies to Latin headlines only. Arabic gets no tracking and taller leading.

**The Tabular Figures Rule.** Every money amount, count, day count and score uses tabular numerals, Western digits in both languages, written "SAR 12,345". Numeric figures and charts render dir="ltr".

## Layout

One content column, max 76rem, with 16 / 24 / 32px gutters at phone / sm / lg. Sections breathe at 80px vertical padding on phones and 112px from sm up; white bands with hairline top and bottom rules alternate with the slate ground to separate sections. Two-column sections split around 0.8fr / 1.2fr with a 64px gap at lg and collapse to one column below.

The decision sheet is a two-pane grid at lg: an 18.5rem rules margin at start, the ranked rows filling the rest. Below lg the rules move under the rows, and on phones the priority control sits directly above the rows it re-ranks. Rows use a fixed six-column grid from md (rank, supplier, total, delivery, warranty, score) and fall back to a rank column plus a definition grid on phones.

Steps run along a 2px ink rule: vertical at the inline start on phones, horizontal across the top at lg, with numbered discs sitting on the rule. Everything is laid out with logical properties (start/end, ms/me, ps/pe, border-s) so RTL mirrors with no overrides.

## Elevation & Depth

Flat and ruled. Depth comes from paper on ground and from rules, not from layered shadows. One shadow exists for the large sheet objects (the decision sheet, the pricing sheet, the dashboard figure): a hairline lip plus a long, soft drop that lifts the sheet off the page like paper on a desk. The hero primary button carries a small version of the same drop. The sticky header uses translucent white with a light backdrop blur.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 1px 0 rgba(15,23,42,0.04), 0 30px 60px -40px rgba(15,23,42,0.45)`): the large document sheets only.
- **Primary lift** (`box-shadow: 0 1px 0 rgba(15,23,42,0.08), 0 8px 24px -12px rgba(15,23,42,0.45)`): the large primary button.
- **Knob** (`box-shadow: 0 1px 2px rgba(15,23,42,0.3)`): the toggle knob.

### Named Rules
**The Rules Not Boxes Rule.** Inside a sheet, structure is drawn with hairline rules and columns. No cards inside cards.

## Shapes

Gently squared. Controls and buttons use a 6px corner, sheets 12px, the stamp a near-square 4px; status discs, step numerals and toggles are full circles. Borders are 1px hairlines in slate-200 to slate-300; 2px ink rules open sections, carry the step track and border the stamp. The approval stamp is the one rotated shape (-7deg), ruled twice: a 2px border and a 1px outline offset 2px.

## Components

### Buttons
Solid, dark and plain.
- **Shape:** gently squared (6px).
- **Primary:** ink background, white 600-weight text, 48px tall with 20px padding (36px / 14px in the header). Trailing arrow nudges 2px on hover and flips in RTL.
- **Hover / Focus:** background to ink-hover; focus is a 2px Clarix Violet ring with 2px offset.
- **Secondary:** white with a control-rule border and ink text; hover darkens the border and fills page-ground.
- **Nav / ghost links:** text-body, 6px corner, hover fills slate-100 and darkens to ink.

### Chips
- **Approval chip:** approval-tint fill, 25% stamp-violet border, approval-ink 600 text with a check.
- **Artifact tag:** page-ground fill, hairline border, text-strong label, tabular.
- **Auto / Manual tag:** approval-tint with approval-ink, or slate-100 with text-body.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** sheet white on page ground.
- **Shadow Strategy:** the Sheet shadow only (see Elevation & Depth).
- **Border:** 1px slate-300 at 80%.
- **Internal Padding:** 20px (phones) / 28px; tiers 24 / 32px.

### Inputs / Fields
- **Style:** white, 1px control-rule border, 6px corner, 10px 12px padding, 0.95rem ink text, stamp-violet caret.
- **Focus:** border goes to ink plus a 2px Clarix Violet ring at 40%.
- **Error:** border waiting-mark; message in waiting-ink.
- **Steppers / segmented / toggle:** 32px square ± buttons; a three-way segmented control with the active segment filled ink; a 36x20 toggle that fills ink when on.

### Navigation
Sticky 64px white bar with a hairline bottom rule: logo and wordmark, three text links (md up), then the language switch, Sign in and the small primary button at the inline end.

### Decision Sheet (signature)
A live tender sheet. Header row over a 1px ink rule; a rules margin on page-ground; ranked supplier rows with the pick row on pick-tint and an "AI pick" note in stamp violet; over-limit cells turn waiting-ink. A rank that just moved stays stamp violet until the next change. The decision bar states the outcome: approved on approval-tint with a stamp-violet check disc and the ruled, rotated stamp carrying today's date; held on waiting-ground with an amber clock disc and the reason.
- **Motion:** rows re-rank with a FLIP glide (260ms, cubic-bezier(0.16, 1, 0.3, 1)); the stamp lands from 1.45 scale (180ms); the decision bar lights by desaturating from a saturated flash (420ms). All three are off under prefers-reduced-motion.

## Do's and Don'ts

### Do:
- **Do** draw structure with hairline rules (slate-200) and open sections with a 2px ink rule.
- **Do** keep stamp violet for approval and amber for "waiting for you" or over-limit values, nothing else.
- **Do** use Clarix Violet for every focus ring (2px) and for text selection.
- **Do** set every figure tabular with Western digits, money as "SAR 12,345", numeric blocks dir="ltr".
- **Do** use logical properties for all spacing, borders and positioning so RTL mirrors for free.
- **Do** apply negative tracking only to LTR headlines; Arabic gets none and taller leading.
- **Do** turn off every animation under prefers-reduced-motion.

### Don't:
- **Don't** use gradients or nest cards inside cards.
- **Don't** set text in Clarix Violet on white; use stamp violet or approval ink.
- **Don't** use the ruled stamp, or stamp violet at full strength, for anything that is not an approval.
- **Don't** use amber for emphasis or decoration.
- **Don't** add uppercase tracked labels above headings; the uppercase tracked style belongs to the stamp word alone.
- **Don't** use Arabic-Indic digits, even in Arabic.
