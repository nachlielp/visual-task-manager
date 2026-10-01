import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Banner callout. The `warn` variant keeps amber (not brand) because amber
 * reads correctly even on pink paper.
 */
const calloutVariants = cva("rounded-lg border-[1.5px] px-5 py-4 text-sm", {
  variants: {
    variant: {
      warn: "callout-warn",
      success: "border-success/40 bg-success-tint text-success",
      danger: "border-danger/40 bg-danger-tint text-danger",
      info: "border-brand/30 bg-tint text-brand",
    },
  },
  defaultVariants: {
    variant: "info",
  },
})

export interface CalloutProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof calloutVariants> {}

function Callout({ className, variant, ...props }: CalloutProps) {
  return <div className={cn(calloutVariants({ variant }), className)} {...props} />
}

export { Callout, calloutVariants }
