"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("inviteSupplier");
  const [open, setOpen] = useState(false);
  const [rfqId, setRfqId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    if (!rfqId) {
      toast.error(t("chooseRfq"));
      return;
    }
    startTransition(async () => {
      const result = await inviteSupplierToRfq(rfqId, supplierId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(t("added", { supplier: supplierLabel }));
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
          <Send size={13} aria-hidden="true" className="rtl:-scale-x-100" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("title")} <bdi>{supplierLabel}</bdi>
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {rfqs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("none")}</p>
        ) : (
          <Select value={rfqId} onValueChange={setRfqId}>
            <SelectTrigger aria-label={t("chooseRfq")}>
              <SelectValue placeholder={t("chooseRfq")} />
            </SelectTrigger>
            <SelectContent>
              {rfqs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <bdi>{r.title}</bdi>
                  {r.status === "draft" ? ` ${t("draft")}` : ""}
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
            {isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t("invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
