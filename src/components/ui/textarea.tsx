import * as React from "react"

import { cn } from "@/lib/utils"

/** Multi-line input. Same border/focus treatment as `Input`, taller. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn("input h-auto min-h-20 resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"

export { Textarea }
