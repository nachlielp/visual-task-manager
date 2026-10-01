import * as React from "react"

import { cn } from "@/lib/utils"

type ToastVariant = "default" | "success" | "danger"
type ToastItem = { id: number; message: string; variant: ToastVariant }

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

/** Wrap the app once; call `useToast().toast("Saved")` anywhere below it. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const nextId = React.useRef(0)

  const toast = React.useCallback((message: string, variant: ToastVariant = "default") => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, variant }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-content-in pointer-events-auto rounded-md border-[1.5px] px-4 py-2 text-sm font-semibold shadow-[0_2px_0_rgba(0,0,0,0.4)]",
              t.variant === "success" && "border-black bg-ink text-white",
              t.variant === "danger" && "border-danger-dark bg-danger text-white",
              t.variant === "default" && "border-black bg-ink text-white"
            )}
          >
            {t.variant === "success" && <span className="mr-1.5 text-success">✓</span>}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>")
  return ctx
}
