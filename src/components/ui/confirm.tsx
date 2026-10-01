import * as React from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ConfirmOptions {
  title: React.ReactNode
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** Styling of the confirm button — use `danger` for destructive actions. */
  variant?: NonNullable<ButtonProps["variant"]>
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

type State = {
  open: boolean
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

/**
 * Wrap the app once, then anywhere below it:
 * `const confirm = useConfirm(); if (await confirm({ title, variant: "danger" })) { … }`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State | null>(null)

  const confirm = React.useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState({ open: true, options, resolve })
      }),
    []
  )

  const settle = (value: boolean) => {
    state?.resolve(value)
    setState((s) => (s ? { ...s, open: false } : s))
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={state?.open ?? false}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        {state && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{state.options.title}</DialogTitle>
              {state.options.description && (
                <DialogDescription>{state.options.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => settle(false)}>
                {state.options.cancelText ?? "Cancel"}
              </Button>
              <Button
                variant={state.options.variant ?? "primary"}
                onClick={() => settle(true)}
              >
                {state.options.confirmText ?? "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within a <ConfirmProvider>")
  return ctx
}
