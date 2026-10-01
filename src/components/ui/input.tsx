import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * White input, 34px tall to align with buttons in the same row. Focus turns
 * the border brand — no glow ring. Never make this a pill; square 6px corners
 * are what pair it with the buttons beside it.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn("input", className)} {...props} />
  )
)
Input.displayName = "Input"

export { Input }
