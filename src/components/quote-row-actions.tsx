"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteQuote } from "@/app/(dashboard)/rfqs/quote-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function QuoteRowActions({
  quoteId,
  supplierLabel,
}: {
  quoteId: string;
  supplierLabel: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteQuote(quoteId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Quote deleted.");
        setConfirmOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-600"
          >
            <MoreHorizontal size={15} />
            <span className="sr-only">Quote actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete quote
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(v) => !isPending && setConfirmOpen(v)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this quote?</DialogTitle>
            <DialogDescription>
              {supplierLabel}&apos;s quote will be permanently deleted. This
              can&apos;t be undone — they&apos;ll become available again for
              a new manual or PDF entry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
