"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "paper-checkbox peer inline-grid h-[18px] w-[18px] shrink-0 cursor-pointer place-items-center border border-[var(--ink3)] bg-transparent p-0 text-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shu)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--shu)] data-[state=checked]:bg-[var(--shu)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "paper-checkbox-mark pointer-events-none block h-[10px] w-[5px] -translate-y-px rotate-45 border-b-[1.5px] border-r-[1.5px] border-current opacity-0 data-[state=checked]:opacity-100"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
