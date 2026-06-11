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
  loading: "处理中",
  success: "完成",
};

function Spinner() {
  return (
    <span
      className="state-morph-spinner"
      aria-hidden="true"
    />
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
  const isBusy = state === "loading";

  return (
    <motion.button
      id={id}
      layout
      type="button"
      className={cn("nd-primary-btn state-morph-btn", className)}
      onClick={onClick}
      disabled={disabled || isBusy}
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
          {state === "loading" && <Spinner />}
          {state === "success" && <CheckIcon />}
          <span>{labels[state]}</span>
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
