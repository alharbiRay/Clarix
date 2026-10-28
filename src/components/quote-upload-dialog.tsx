"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { uploadQuotePdf } from "@/app/(dashboard)/rfqs/quote-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface UploadSupplierOption {
  id: string;
  label: string;
}

export function QuoteUploadDialog({
  rfqId,
  suppliers,
}: {
  rfqId: string;
  /** Suppliers that don't have a quote yet */
  suppliers: UploadSupplierOption[];
}) {
  const t = useTranslations("upload");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!supplierId) {
      toast.error(t("chooseSupplier"));
      return;
    }
    if (!file) {
      toast.error(t("chooseFile"));
      return;
    }

    const formData = new FormData();
    formData.set("rfqId", rfqId);
    formData.set("supplierId", supplierId);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadQuotePdf(formData);
      if (result.error) {
        if ("needsManualEntry" in result && result.needsManualEntry) {
          toast.error(t("needsManualEntry"), { duration: 10_000 });
          setOpen(false);
        } else toast.error(result.error);
      } else if (result.quoteId) {
        toast.success(t("done"));
        setOpen(false);
        router.push(`/rfqs/${rfqId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileUp size={14} aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-supplier">{t("supplier")}</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="upload-supplier">
                <SelectValue placeholder={t("supplierPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <bdi>{s.label}</bdi>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 && <p className="text-xs text-slate-500">{t("allQuoted")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-pdf">{t("file")}</Label>
            <Input id="quote-pdf" ref={fileRef} type="file" accept="application/pdf" />
            <p className="text-xs text-slate-500">{t("vatHint")}</p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || suppliers.length === 0} className="gap-2">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {t("extracting")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t("extract")}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
