"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/rfqs", label: "rfqs", icon: FileText },
  { href: "/suppliers", label: "suppliers", icon: Users },
  { href: "/reports", label: "reports", icon: BarChart3 },
  { href: "/settings", label: "settings", icon: Settings },
] as const;

interface SidebarUser {
  email: string;
  fullName: string | null;
}

/** Logo, main navigation and the account menu — shared by the desktop sidebar and the phone drawer. */
function SidebarContent({ email, fullName, onNavigate }: SidebarUser & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");

  async function signOut() {
    const supabase = createClient();
    // Sign out this browser only — never other devices (and, for the shared
    // demo account, never every other visitor).
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  const initial = (fullName || email)[0]?.toUpperCase() ?? "?";

  return (
    <>
      <div className="flex items-center gap-2.5 px-6 py-5">
        <Logo className="h-8 w-8" />
        <span className="text-lg font-bold tracking-tight">Clarix</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-2" aria-label={t("mainNav")}>
        {NAV.map((item) => {
          const active =
            pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon size={17} aria-hidden="true" />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="m-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-start transition-colors hover:bg-slate-100">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{fullName || t("buyer")}</p>
              <p className="truncate text-xs text-slate-400">{email}</p>
            </div>
            <ChevronDown size={15} className="ms-auto shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="me-2 h-4 w-4" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Fixed sidebar from the lg breakpoint up; below it, MobileNav takes over. */
export function AppSidebar(props: SidebarUser) {
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-60 flex-col border-e border-slate-200 bg-white lg:flex print:hidden">
      <SidebarContent {...props} />
    </aside>
  );
}

/** Phones and tablets: a menu button in the top bar that opens the same navigation as a drawer. */
export function MobileNav(props: SidebarUser) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Close after any navigation (links, back/forward).
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="-ms-1 rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] lg:hidden"
          aria-label={t("openMenu")}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </SheetTrigger>
      {/* "left" is the start side: the drawer opens from the right in Arabic. */}
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetTitle className="sr-only">{t("mainNav")}</SheetTitle>
        <SidebarContent {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
