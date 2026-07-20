"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rfqs", label: "RFQs", icon: FileText },
  { href: null, label: "Suppliers", icon: Users },
  { href: null, label: "Reports", icon: BarChart3 },
  { href: null, label: "Settings", icon: Settings },
] as const;

export function AppSidebar({
  email,
  fullName,
}: {
  email: string;
  fullName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (fullName || email)[0]?.toUpperCase() ?? "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
          C
        </div>
        <span className="text-lg font-bold tracking-tight">Clarix</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 pt-2">
        {NAV.map((item) => {
          const active =
            item.href !== null &&
            (pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href)));

          const classes = cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            active
              ? "bg-slate-900 text-white"
              : item.href
                ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                : "cursor-default text-slate-300"
          );

          if (!item.href) {
            return (
              <span key={item.label} className={classes} title="Coming soon">
                <item.icon size={17} />
                {item.label}
              </span>
            );
          }

          return (
            <Link key={item.label} href={item.href} className={classes}>
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="m-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {fullName || "Buyer"}
              </p>
              <p className="truncate text-xs text-slate-400">{email}</p>
            </div>
            <ChevronDown size={15} className="ml-auto shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
