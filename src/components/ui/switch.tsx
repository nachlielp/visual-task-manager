import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/** Toggle. On = brand fill; off = line-strong. Hard, no gradient. */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] p-0.5 transition-colors",
      "data-[state=checked]:border-brand-dark data-[state=checked]:bg-brand",
      "data-[state=unchecked]:border-line-strong data-[state=unchecked]:bg-paper-dark",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform",
        "data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
