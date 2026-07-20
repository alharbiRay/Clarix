"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!supplierId) {
      toast.error("Choose which supplier sent this quote");
      return;
    }
    if (!file) {
      toast.error("Choose a PDF file");
      return;
    }

    const formData = new FormData();
    formData.set("rfqId", rfqId);
    formData.set("supplierId", supplierId);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadQuotePdf(formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.quoteId) {
        toast.success("Quote extracted — review the values before confirming.");
        setOpen(false);
        router.push(`/rfqs/${rfqId}/quotes/${result.quoteId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileUp size={14} />
          Upload PDF quote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a PDF quote</DialogTitle>
          <DialogDescription>
            For suppliers who replied with a PDF instead of the form. Gemini
            extracts the prices; you review them before they count.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Who sent this quote?" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 && (
              <p className="text-xs text-slate-400">
                Every supplier on this RFQ already has a quote.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-pdf">Quote PDF (max 10 MB)</Label>
            <Input id="quote-pdf" ref={fileRef} type="file" accept="application/pdf" />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || suppliers.length === 0}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Extract with AI
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
