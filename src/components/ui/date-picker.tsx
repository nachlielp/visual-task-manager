import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { IconCalendar, IconClock } from "@/components/Icons"

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export interface DatePickerProps {
  value?: Date
  onChange?: (date: Date) => void
  placeholder?: string
  /** Show a time field below the calendar and include it in the trigger label. */
  withTime?: boolean
  /** Minute granularity of the time dropdown (default 5). */
  minuteStep?: number
  className?: string
  disabled?: boolean
}

/**
 * Date (and optionally time) picker: a secondary button that opens a calendar
 * popover. Controlled via `value` / `onChange`. Pass `withTime` for a
 * date+time picker — the HH:MM control opens a single popup with an hours
 * slider and a minutes slider, not the browser's native time control.
 */
function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  withTime = false,
  minuteStep = 5,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const hours = value?.getHours() ?? 0
  const mins = value?.getMinutes() ?? 0

  const setTimePart = (part: "h" | "m", n: number) => {
    const base = value ? new Date(value) : new Date()
    if (!value) base.setHours(0, 0, 0, 0) // start from midnight until a day is chosen
    if (part === "h") base.setHours(n, base.getMinutes(), 0, 0)
    else base.setMinutes(n, 0, 0)
    onChange?.(base)
  }

  const handleDay = (day: Date) => {
    onChange?.(day)
    if (!withTime) setOpen(false)
  }

  const label = value
    ? withTime
      ? `${formatDate(value)} · ${pad(value.getHours())}:${pad(value.getMinutes())}`
      : formatDate(value)
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          disabled={disabled}
          className={cn("justify-start font-semibold", !value && "text-muted", className)}
        >
          <IconCalendar className="text-base text-muted" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar value={value} onChange={handleDay} />
        {withTime && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t-[1.5px] border-line pt-3">
            {/* The HH:MM control opens one popup holding both sliders. */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Edit time"
                  className="input flex w-[120px] items-center justify-center gap-2 font-semibold tabular-nums data-[state=open]:border-brand"
                >
                  <IconClock className="text-base text-muted" />
                  {pad(hours)}:{pad(mins)}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64">
                <div className="mb-3 text-center font-mono text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                  {pad(hours)}:{pad(mins)}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="kicker text-muted">Hours</span>
                    <span className="font-mono text-sm font-bold text-brand tabular-nums">
                      {pad(hours)}
                    </span>
                  </div>
                  <Slider
                    aria-label="Hours"
                    min={0}
                    max={23}
                    step={1}
                    value={[hours]}
                    onValueChange={([v]) => setTimePart("h", v)}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="kicker text-muted">Minutes</span>
                    <span className="font-mono text-sm font-bold text-brand tabular-nums">
                      {pad(mins)}
                    </span>
                  </div>
                  <Slider
                    aria-label="Minutes"
                    min={0}
                    max={59}
                    step={minuteStep}
                    value={[mins]}
                    onValueChange={([v]) => setTimePart("m", v)}
                  />
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
