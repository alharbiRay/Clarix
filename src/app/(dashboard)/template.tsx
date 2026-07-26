"use client";

import { motion } from "framer-motion";

/**
 * Unlike layout.tsx, template.tsx remounts on every navigation — which is
 * what makes a per-page enter animation possible. Composes fine with the
 * per-element FadeIn/Stagger animations already used inside individual pages
 * (src/components/motion.tsx): this outer container fades/slides in while
 * inner elements run their own staggered entrance, same layered look most
 * dashboards use rather than a conflict.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}
