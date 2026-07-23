"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSupplierNotes } from "@/app/(dashboard)/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export function SupplierNotes({
  supplierId,
  initialNotes,
}: {
  supplierId: string;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();

  const dirty = notes !== savedNotes;

  function handleSave() {
    startTransition(async () => {
      const result = await updateSupplierNotes(supplierId, notes);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setSavedNotes(notes);
        toast.success("Notes saved.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Private notes — only you can see this (e.g. negotiation history, quirks, preferred contact method)."
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={!dirty || isPending} className="gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save notes
        </Button>
      </div>
    </div>
  );
}
