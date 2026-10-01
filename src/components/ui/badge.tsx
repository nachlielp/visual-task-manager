import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Small status pill. Semantic states use their OWN tint (success/danger),
 * never the accent tint. Reserve `brand` (accent tint) for selected/active.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border-[1.5px] px-2 py-0.5 text-[11px] font-bold leading-tight",
  {
    variants: {
      variant: {
        brand: "border-brand/30 bg-tint text-brand",
        neutral: "border-line bg-paper-dark text-muted",
        success: "border-success/30 bg-success-tint text-success",
        danger: "border-danger/30 bg-danger-tint text-danger",
        outline: "border-line-strong bg-white text-ink",
      },
    },
    defaultVariants: {
      variant: "brand",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
