"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, QUOTE_LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";

const ONE_YEAR = 60 * 60 * 24 * 365;

function remember(locale: Locale) {
  cookies().set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}

/**
 * Switches the interface language. Saved in a cookie for everyone, and on the
 * profile for signed-in buyers so it follows them to other devices. (The demo
 * account's profile is read-only; its visitors still get the cookie.)
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return { error: "Unsupported language" };
  remember(locale);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
  revalidatePath("/", "layout");
  return { success: true as const };
}

/**
 * The supplier quote page's switch: its own cookie only. Never touches a
 * profile, so a buyer previewing their own supplier link can't change their
 * language (or have it saved as the supplier's).
 */
export async function setQuoteLocale(locale: string) {
  if (!isLocale(locale)) return { error: "Unsupported language" };
  cookies().set(QUOTE_LOCALE_COOKIE, locale, { path: "/quote", maxAge: ONE_YEAR, sameSite: "lax" });
  return { success: true as const };
}

/**
 * After sign-in: a language saved on the profile wins over this browser's
 * cookie; a buyer with none saved keeps (and saves) the one they're using —
 * chosen with the switcher or picked from the browser's languages.
 */
export async function syncLocaleAfterSignIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
  const saved = data?.locale;
  if (isLocale(saved)) {
    remember(saved);
  } else {
    await supabase.from("profiles").update({ locale: await resolveLocale() }).eq("id", user.id);
  }
}
