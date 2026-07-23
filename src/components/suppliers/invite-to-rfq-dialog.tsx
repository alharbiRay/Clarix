"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { inviteSupplierToRfq } from "@/app/(dashboard)/suppliers/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface InvitableRfq {
  id: string;
  title: string;
  status: string;
}

export function InviteToRfqDialog({
  supplierId,
  supplierLabel,
  rfqs,
}: {
  supplierId: string;
  supplierLabel: string;
  rfqs: InvitableRfq[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rfqId, setRfqId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    if (!rfqId) {
      toast.error("Choose an RFQ");
      return;
    }
    startTransition(async () => {
      const result = await inviteSupplierToRfq(rfqId, supplierId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${supplierLabel} added to the RFQ.`);
        setOpen(false);
        setRfqId("");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Send size={13} />
          Invite to RFQ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite {supplierLabel}</DialogTitle>
          <DialogDescription>Add this supplier to one of your open RFQs.</DialogDescription>
        </DialogHeader>

        {rfqs.length === 0 ? (
          <p className="text-sm text-slate-400">No open RFQs — create one first.</p>
        ) : (
          <Select value={rfqId} onValueChange={setRfqId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an RFQ" />
            </SelectTrigger>
            <SelectContent>
              {rfqs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                  {r.status === "draft" ? " (draft)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button
            onClick={handleInvite}
            disabled={isPending || rfqs.length === 0}
            className="gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
