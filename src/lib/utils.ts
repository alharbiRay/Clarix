import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
}

/**
 * Chromium renders `<input type="number">` using the OS numbering system —
 * on a Windows box regionalized to Arabic, digits show as ٠-٩ even though
 * the page is `lang="en"`. Number inputs in this app are `type="text"` with
 * `inputMode` instead, and route user keystrokes through this so Arabic-Indic
 * digits (however they got typed) are normalized to Latin before they hit
 * form state.
 */
export function toLatinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d)
}

/** Keeps only digits and a single decimal point, with Arabic-Indic digits normalized first. */
export function sanitizeDecimalInput(value: string) {
  const latin = toLatinDigits(value)
  const cleaned = latin.replace(/[^0-9.]/g, "")
  const firstDot = cleaned.indexOf(".")
  if (firstDot === -1) return cleaned
  return (
    cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
  )
}

/** Keeps only digits, with Arabic-Indic digits normalized first. */
export function sanitizeIntegerInput(value: string) {
  return toLatinDigits(value).replace(/[^0-9]/g, "")
}
