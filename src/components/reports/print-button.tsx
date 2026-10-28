"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; "Save as PDF" is one of its destinations. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
      <Printer size={14} aria-hidden="true" />
      Print or save as PDF
    </Button>
  );
}
