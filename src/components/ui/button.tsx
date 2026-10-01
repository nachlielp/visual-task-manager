import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The signature 3D button. One fixed height (34px) — there is deliberately no
 * `size` variant; when a real button is too heavy, use `variant="ghost"`.
 */
const buttonVariants = cva("", {
  variants: {
    variant: {
      primary: "btn btn-primary",
      secondary: "btn btn-secondary",
      danger: "btn btn-danger",
      success: "btn btn-success",
      ghost: "btn-ghost",
      "ghost-danger": "btn-ghost btn-ghost-danger",
    },
  },
  defaultVariants: {
    variant: "secondary",
  },
})

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. an `<a>`), keeping the button styling. */
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
