"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Bell, Plus } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

export function AppTopbar({ unreadCount = 0, mobileNav }: { unreadCount?: number; mobileNav?: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations("topbar");

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:gap-3 lg:px-8 lg:py-4 print:hidden">
      {mobileNav}
      <form
        className="relative min-w-0 flex-1 lg:max-w-80"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(q ? `/rfqs?q=${encodeURIComponent(String(q))}` : "/rfqs");
        }}
      >
        <Search
          size={16}
          className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          name="q"
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 ps-9 pe-4 text-sm outline-none transition-colors focus:border-slate-400 focus:bg-white"
        />
      </form>
      <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <LanguageSwitcher className="px-2 sm:px-2.5" />
        <Link
          href="/dashboard"
          className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
          title={t("notifications")}
          aria-label={unreadCount > 0 ? t("notificationsUnread", { count: unreadCount }) : t("notificationsNone")}
        >
          <Bell size={18} aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
          )}
        </Link>
        <Link
          href="/rfqs/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:px-4"
          aria-label={t("newRfq")}
        >
          <Plus size={16} aria-hidden="true" /> <span className="hidden sm:inline">{t("newRfq")}</span>
        </Link>
      </div>
    </header>
  );
}
