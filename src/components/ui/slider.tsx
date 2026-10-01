import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

/** Track fills brand from the start; thumb is a white knob with a brand edge. */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-1",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full border-[1.5px] border-line bg-paper-dark">
      <SliderPrimitive.Range className="absolute h-full bg-brand" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-[18px] w-[18px] cursor-grab rounded-full border-[1.5px] border-brand-dark bg-white shadow-[0_2px_0_var(--color-brand-dark)]",
        "transition-transform active:cursor-grabbing active:translate-y-0.5 active:shadow-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
