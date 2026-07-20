"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/** Fade-and-rise entrance. Wrap page sections; stagger with `delay`. */
export function FadeIn({
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      {...props}
    />
  );
}

/** Parent that staggers its <StaggerItem> children. */
export function Stagger({
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.03, delayChildren: delay } },
      }}
      {...props}
    />
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] },
        },
      }}
      {...props}
    />
  );
}
