"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { approveAward } from "@/app/(dashboard)/rfqs/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ApproveAwardButton({
  rfqId,
  supplierLabel,
  size = "sm",
  className,
}: {
  rfqId: string;
  supplierLabel: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      const result = await approveAward(rfqId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Approved — PO sent to ${supplierLabel}.`);
        router.refresh();
      }
    });
  }

  return (
    <Button
      size={size}
      onClick={handleApprove}
      disabled={isPending}
      className={cn("gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700", className)}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      Approve &amp; Send PO
    </Button>
  );
}
