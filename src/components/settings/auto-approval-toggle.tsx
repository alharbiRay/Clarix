"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAutoApprovalSetting } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";

export function AutoApprovalToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (next === enabled) return;
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await updateAutoApprovalSetting(next);
      if (result?.error) {
        setEnabled(previous);
        toast.error(result.error);
      } else {
        toast.success(next ? "Auto-approval enabled" : "Auto-approval disabled");
      }
    });
  }

  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={enabled ? "default" : "outline"}
        className="h-8 px-4 text-xs"
        disabled={isPending}
        onClick={() => handleChange(true)}
      >
        Enabled
      </Button>
      <Button
        type="button"
        size="sm"
        variant={!enabled ? "default" : "outline"}
        className="h-8 px-4 text-xs"
        disabled={isPending}
        onClick={() => handleChange(false)}
      >
        Disabled
      </Button>
    </div>
  );
}
