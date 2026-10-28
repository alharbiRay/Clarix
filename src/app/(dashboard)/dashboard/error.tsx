"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("dashboard");
  useEffect(() => {
    console.error(JSON.stringify({ event: "dashboard.render_failed", digest: error.digest }));
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert">
      <AlertTriangle className="mx-auto text-amber-600" size={22} aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">{t("errorTitle")}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {t("errorBody")}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2"
      >
        <RotateCw size={14} aria-hidden /> {t("tryAgain")}
      </button>
    </div>
  );
}
