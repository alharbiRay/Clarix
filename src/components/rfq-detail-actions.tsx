"use client";

import { useTransition } from "react";
import { Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendRfq } from "@/app/(dashboard)/rfqs/actions";
import { Button } from "@/components/ui/button";

export function SendRfqButton({ rfqId }: { rfqId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    startTransition(async () => {
      const result = await sendRfq(rfqId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("RFQ sent — suppliers have been invited.");
      }
    });
  }

  return (
    <Button onClick={handleSend} disabled={isPending} className="gap-2">
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      Send invitations
    </Button>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        toast.success("Quote link copied");
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      Copy link
    </Button>
  );
}
