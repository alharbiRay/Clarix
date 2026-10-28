# Phase 10: Arabic/English, RTL and VAT

1. Locale plumbing (`src/i18n`):
   - next-intl without locale routing. The language comes from the `NEXT_LOCALE` cookie, then the
     browser's Accept-Language, then English (D-062). Every existing URL keeps working.
   - `messages/en.json` and `messages/ar.json`, one namespace per screen. Arabic plurals use all six
     ICU forms.
   - `translatorFor(locale, namespace)` serves code that runs outside a request: emails, the audit
     timeline, scorecard sentences, CSV headers.
   - Tests: the two files have the same keys and the same placeholders, no Arabic message is empty,
     and Arabic messages use Western digits.
2. Shell:
   - `<html lang dir>` follows the language. IBM Plex Sans Arabic joins the font stack.
   - A language switcher sits in the top bar and on the login page. Signing in restores the
     language saved on the profile (`profiles.locale`).
3. RTL:
   - Tailwind logical classes throughout (`ms/me/ps/pe/start/end/text-start/border-s`).
   - Arrows flip with `rtl:rotate-180`. Charts stay left to right.
   - Names and other free text are wrapped in `<bdi>` or `dir="auto"`, so English supplier names
     inside Arabic sentences keep their order.
4. Numbers:
   - Western digits everywhere.
   - Money reads "SAR 14,547.50" in both languages.
   - Arabic dates use the month name ("23 أكتوبر 2026"), in Riyadh time.
5. Screens translated:
   - Dashboard, RFQs (list, detail, new, compare, quote review) and suppliers (list, scorecard).
   - Settings, reports and CSV.
   - Audit timeline, recommendation and negotiation dialogs, form validation messages.
6. Supplier side:
   - The quote form picks the supplier's language. The order is: their saved preference, then
     Arabic script in their name, then the buyer's language. They can switch, and their choice is
     saved on the supplier record.
   - The invitation and purchase order emails use the same rule. Both are HTML-escaped and set
     `lang`/`dir`.
   - The buyer's auto-approved and review-needed emails use the buyer's language.
7. VAT (D-063):
   - `profiles.vat_rate` (default 15%, 0 hides it), set in Settings.
   - Quote prices are stored excluding VAT. PDF extraction converts prices that include VAT and
     notes that it did.
   - The comparison, the supplier form and the PO email show the total before VAT, the VAT line,
     and the total including VAT.
8. AI output: recommendations are written in the buyer's language, and supplier names are kept
   exactly as written.
9. Migration `0017_locale_and_vat.sql` adds `profiles.locale` and `profiles.vat_rate`, plus the
   column grant. It is additive.
