"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useLanguage } from "@/app/contexts/LanguageContext";

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
  idle: "解析",
  loading: "停止",
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
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  return (
    <button
      id={id}
      type="button"
      className={cn("nd-primary-btn state-morph-btn", className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={state === "loading" ? t("终止解析") : undefined}
      title={state === "loading" ? t("终止解析") : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          className="state-morph-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }}
        >
          {state === "loading" && <StopIcon />}
          {state === "success" && <CheckIcon />}
          <span>{t(labels[state])}</span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
