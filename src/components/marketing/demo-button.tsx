"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { startDemoSession } from "@/app/demo/actions";
import { cn } from "@/lib/utils";

function Submit({ size, label }: { size: "lg" | "sm"; label?: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("demo");
  const tSite = useTranslations("site");
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-slate-950 font-semibold text-white transition-[background-color,box-shadow] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80",
        size === "lg" ? "h-12 px-5 text-[0.95rem] shadow-[0_1px_0_rgba(15,23,42,0.08),0_8px_24px_-12px_rgba(15,23,42,0.45)]" : "h-9 px-3.5 text-sm"
      )}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
          {size === "lg" ? t("opening") : tSite("demoShort")}
        </>
      ) : (
        <>
          {label ??
            (size === "lg" ? (
              t("explore")
            ) : (
              <>
                <span className="sm:hidden">{tSite("demoShort")}</span>
                <span className="hidden sm:inline">{tSite("tryDemo")}</span>
              </>
            ))}
          <ArrowRight
            size={16}
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
        </>
      )}
    </button>
  );
}

/** Opens the read-only demo workspace: a POST form, so crawlers and prefetchers never open sessions. */
export function DemoButton({ size = "lg", label }: { size?: "lg" | "sm"; label?: string }) {
  return (
    <form action={startDemoSession}>
      <Submit size={size} label={label} />
    </form>
  );
}
