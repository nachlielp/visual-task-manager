import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export interface ModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional element that opens the modal (rendered via `asChild`). */
  trigger?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  /** Footer actions — already wraps + centers for narrow screens. */
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * Convenience wrapper over the Dialog primitives for the common case:
 * `<Modal trigger={...} title description footer>body</Modal>`. For full
 * control, compose the Dialog parts directly instead.
 */
function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn(className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export { Modal }
