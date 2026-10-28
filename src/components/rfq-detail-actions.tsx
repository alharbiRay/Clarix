"use client";

import { useTransition } from "react";
import { Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { sendRfq } from "@/app/(dashboard)/rfqs/actions";
import { Button } from "@/components/ui/button";

export function SendRfqButton({ rfqId }: { rfqId: string }) {
  const t = useTranslations("rfqActions");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    startTransition(async () => {
      try {
        const result = await sendRfq(rfqId);
        if (result?.error) {
          toast.error(result.error);
        } else if (result.emailFailures && result.emailFailures.length > 0) {
          toast.warning(t("sentWithFailures", { emails: result.emailFailures.join(", ") }));
        } else {
          toast.success(t("sent"));
        }
      } catch (e) {
        console.error("sendRfq threw unexpectedly:", e);
        toast.error(t("sendFailed"));
      }
    });
  }

  return (
    <Button onClick={handleSend} disabled={isPending} className="gap-2">
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      )}
      {t("send")}
    </Button>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const t = useTranslations("rfqActions");
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success(t("linkCopied"));
        } catch {
          toast.error(t("copyFailed"));
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {t("copyLink")}
    </Button>
  );
}
