"use client";

import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction";

/**
 * Radix widgets (Select, DropdownMenu, Tabs) don't read <html dir>: they
 * default to "ltr" and write it on their own elements, portals included.
 * This tells them the page direction.
 */
export function DirectionProvider({ dir, children }: { dir: "ltr" | "rtl"; children: React.ReactNode }) {
  return <RadixDirectionProvider dir={dir}>{children}</RadixDirectionProvider>;
}
