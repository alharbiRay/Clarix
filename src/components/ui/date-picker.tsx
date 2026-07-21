"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function toIsoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Date input rendered entirely by our own React tree (Popover + Calendar)
 * instead of the browser's native <input type="date">. Native date inputs
 * render their picker UI (and sometimes the value itself) using the OS/
 * browser locale — on a system set to Arabic that can mean Arabic-Indic
 * numerals or a Hijri calendar, which we can't override with CSS or the
 * page's own language. This component always renders Gregorian, en-US.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  minDate,
  className,
}: {
  /** ISO date string (yyyy-mm-dd), or "" / undefined for no selection. */
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? new Date(`${value}T00:00:00`) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 text-left font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          {selected
            ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(selected)
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => {
            onChange(date ? toIsoDate(date) : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
