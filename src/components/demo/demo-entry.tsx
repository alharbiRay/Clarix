"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { startDemoSession } from "@/app/demo/actions";
import { cn } from "@/lib/utils";

function SubmitButton({ prominent }: { prominent: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations("demo");
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "group inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80",
        prominent
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
          {t("opening")}
        </>
      ) : (
        <>
          {t("explore")}
          <ArrowRight
            size={15}
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
        </>
      )}
    </button>
  );
}

/**
 * "Try the demo" — a POST form, so only a deliberate click opens a session.
 * Used on the login page (quiet variant) and on /demo (prominent).
 */
export function DemoEntry({ prominent = false }: { prominent?: boolean }) {
  const t = useTranslations("demo");
  return (
    <div className={cn(!prominent && "space-y-3")}>
      {!prominent && (
        <div className="flex items-center gap-3 text-xs text-slate-400" aria-hidden>
          <span className="h-px flex-1 bg-slate-200" />
          {t("orLook")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}
      <form action={startDemoSession}>
        <SubmitButton prominent={prominent} />
      </form>
      {!prominent && (
        <p className="text-center text-xs text-slate-500">
          {t("entryNote")}
        </p>
      )}
    </div>
  );
}
