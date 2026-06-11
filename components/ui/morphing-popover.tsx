"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  Transition,
  Variants,
} from "motion/react";

import { cn } from "@/lib/utils";
import { useClickOutside } from "@/components/ui/use-click-outside";

const TRANSITION = {
  type: "spring",
  bounce: 0.1,
  duration: 0.4,
} satisfies Transition;

type MorphingPopoverContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  uniqueId: string;
  variants?: Variants;
};

const MorphingPopoverContext =
  createContext<MorphingPopoverContextValue | null>(null);

function usePopoverLogic({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const uniqueId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolledOpen;

  const open = useCallback(() => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(true);
    }
    onOpenChange?.(true);
  }, [controlledOpen, onOpenChange]);

  const close = useCallback(() => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(false);
    }
    onOpenChange?.(false);
  }, [controlledOpen, onOpenChange]);

  return { isOpen, open, close, uniqueId };
}

export type MorphingPopoverProps = {
  children: React.ReactNode;
  transition?: Transition;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variants?: Variants;
  className?: string;
} & React.ComponentProps<"div">;

function MorphingPopover({
  children,
  transition = TRANSITION,
  defaultOpen,
  open,
  onOpenChange,
  variants,
  className,
  ...props
}: MorphingPopoverProps) {
  const popoverLogic = usePopoverLogic({ defaultOpen, open, onOpenChange });

  return (
    <MorphingPopoverContext.Provider value={{ ...popoverLogic, variants }}>
      <MotionConfig transition={transition}>
        <div
          className={cn("relative flex items-center justify-center", className)}
          {...props}
        >
          {children}
        </div>
      </MotionConfig>
    </MorphingPopoverContext.Provider>
  );
}

export type MorphingPopoverTriggerProps = {
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<typeof motion.button>;

function MorphingPopoverTrigger({
  children,
  className,
  ...props
}: MorphingPopoverTriggerProps) {
  const context = useContext(MorphingPopoverContext);
  if (!context) {
    throw new Error(
      "MorphingPopoverTrigger must be used within MorphingPopover"
    );
  }

  const ariaLabel =
    props["aria-label"] ??
    (typeof props.title === "string" ? props.title : undefined);
  const isFabTrigger =
    typeof className === "string" && className.includes("morphing-chat-trigger");

  return (
    <span
      className={cn(
        "morphing-popover-trigger-shell",
        isFabTrigger && "morphing-popover-trigger-shell-fab"
      )}
    >
      <AnimatePresence initial={false}>
        {!context.isOpen && (
          <motion.button
            {...props}
            layoutId={`popover-container-${context.uniqueId}`}
            onClick={context.open}
            className={className}
            aria-label={ariaLabel}
            aria-expanded={context.isOpen}
            aria-controls={`popover-content-${context.uniqueId}`}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {!context.isOpen && (
          <motion.span
            key="trigger-content"
            layout="position"
            className="morphing-popover-trigger-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            aria-hidden="true"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export type MorphingPopoverContentProps = {
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<typeof motion.div>;

function MorphingPopoverContent({
  children,
  className,
  ...props
}: MorphingPopoverContentProps) {
  const context = useContext(MorphingPopoverContext);
  if (!context) {
    throw new Error(
      "MorphingPopoverContent must be used within MorphingPopover"
    );
  }

  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, context.close);

  useEffect(() => {
    if (!context.isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        context.close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [context]);

  return (
    <AnimatePresence>
      {context.isOpen && (
        <motion.div
          {...props}
          ref={ref}
          layoutId={`popover-container-${context.uniqueId}`}
          id={`popover-content-${context.uniqueId}`}
          role="dialog"
          aria-modal="true"
          className={cn(
            "absolute overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] text-[var(--ink)] shadow-[0_20px_50px_-10px_rgba(40,10,80,.25),0_2px_8px_rgba(20,10,40,.06)]",
            className
          )}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={context.variants}
          transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
        >
          <motion.div
            layout="position"
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut", delay: 0.05 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { MorphingPopover, MorphingPopoverTrigger, MorphingPopoverContent };
