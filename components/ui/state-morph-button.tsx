"use client";

import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

export type StateMorphButtonState = "idle" | "loading" | "success";

type StateMorphButtonProps = {
  id?: string;
  state: StateMorphButtonState;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

const labels: Record<StateMorphButtonState, string> = {
  idle: "提交",
  loading: "终止",
  success: "完成",
};

function StopIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function StateMorphButton({
  id,
  state,
  onClick,
  disabled,
  className,
}: StateMorphButtonProps) {
  return (
    <motion.button
      id={id}
      layout
      type="button"
      className={cn("nd-primary-btn state-morph-btn", className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={state === "loading" ? "终止解析" : undefined}
      title={state === "loading" ? "终止解析" : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          className="state-morph-content"
          initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          {state === "loading" && <StopIcon />}
          {state === "success" && <CheckIcon />}
          <span>{labels[state]}</span>
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
