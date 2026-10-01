import * as React from "react"

import { cn } from "@/lib/utils"
import { IconChevron } from "@/components/Icons"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export interface CalendarProps {
  /** Currently selected date (time is preserved when a new day is picked). */
  value?: Date
  onChange?: (date: Date) => void
  className?: string
}

/**
 * Dependency-free month calendar. Selected day = brand fill; today is
 * outlined in brand; days outside the month are muted.
 */
function Calendar({ value, onChange, className }: CalendarProps) {
  const today = React.useMemo(() => new Date(), [])
  const [view, setView] = React.useState(() => {
    const base = value ?? today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const days = React.useMemo(() => {
    const startWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
    const gridStart = new Date(view.getFullYear(), view.getMonth(), 1 - startWeekday)
    return Array.from({ length: 42 }, (_, i) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    )
  }, [view])

  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1))

  const pick = (day: Date) => {
    const next = new Date(day)
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0)
    }
    onChange?.(next)
  }

  return (
    <div className={cn("w-[248px] select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="btn-ghost h-8 w-8 p-0"
        >
          <IconChevron className="rotate-180 text-base" />
        </button>
        <div className="text-sm font-bold text-ink">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="btn-ghost h-8 w-8 p-0"
        >
          <IconChevron className="text-base" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div key={w} className="kicker py-1 text-center text-muted">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const inMonth = day.getMonth() === view.getMonth()
          const selected = value ? isSameDay(day, value) : false
          const isToday = isSameDay(day, today)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pick(day)}
              aria-pressed={selected}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-[13px] font-semibold transition-colors",
                inMonth ? "text-ink" : "text-muted/50",
                !selected && "hover:bg-paper-dark",
                !selected && isToday && "border-[1.5px] border-brand text-brand",
                selected && "border-[1.5px] border-brand-dark bg-brand text-white"
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { Calendar, isSameDay }
