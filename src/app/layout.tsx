import type { Metadata } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { MotionProvider } from "@/components/motion-provider";
import { DirectionProvider } from "@/components/direction-provider";
import { dirOf, isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

// No generated fallback: next/font would put a size-matched Arial right after
// Geist, and Arial has Arabic glyphs, so Arabic text never reached Plex Arabic.
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  adjustFontFallback: false,
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
// Geist has no Arabic glyphs; the browser picks these up for Arabic text
// (see fontFamily.sans in tailwind.config.ts). Plex Arabic matches Geist's
// neutral, geometric tone.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { metadataBase: new URL(siteOrigin()), title: t("title"), description: t("description") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = await getMessages();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Riyadh">
          <DirectionProvider dir={dirOf(locale)}>
            <MotionProvider>{children}</MotionProvider>
            <Toaster richColors position={locale === "ar" ? "top-left" : "top-right"} dir={dirOf(locale)} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
