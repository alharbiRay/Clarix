"use client";

import { MotionConfig } from "framer-motion";

/**
 * Applies framer-motion's `reducedMotion="user"` across the whole app, so the
 * page transitions (app/(dashboard)/template.tsx) and the FadeIn/Stagger
 * entrances all honour the OS "reduce motion" setting without every component
 * having to branch on it itself. Movement is dropped for those users while
 * opacity still resolves, so nothing reads as broken or half-rendered.
 *
 * Server components passed through `children` stay server-rendered — this is a
 * provider boundary, not a client-side conversion of the tree below it.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
