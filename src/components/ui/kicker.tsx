import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 11px/800 uppercase label used above headings and as section titles.
 * `brand` above hero headings, `muted` in chrome (the default here).
 */
const Kicker = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("kicker text-muted", className)} {...props} />
  )
)
Kicker.displayName = "Kicker"

export { Kicker }
