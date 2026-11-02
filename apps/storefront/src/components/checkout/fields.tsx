"use client"

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react"

// Form fields in the Stancil style: rounded, black outline, like the newsletter box.
const box =
  "h-[46px] w-full rounded-full border-[1.5px] border-black bg-white px-5 text-[15px] outline-none placeholder:text-black/40 focus:ring-2 focus:ring-black/20 disabled:bg-pill disabled:text-black/50 lg:h-[50px] lg:text-[16px]"

export function Field({
  label,
  error,
  hint,
  className = "",
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: ReactNode }) {
  return (
    <label className={`flex flex-col gap-[6px] ${className}`}>
      <span className="px-1 text-[13px] font-medium lg:text-[14px]">{label}</span>
      <input {...input} aria-invalid={!!error} className={`${box} ${error ? "border-red-600" : ""}`} />
      {error ? (
        <span className="px-1 text-[13px] text-red-700">{error}</span>
      ) : hint ? (
        <span className="px-1 text-[13px] text-black/60">{hint}</span>
      ) : null}
    </label>
  )
}

export function SelectField({
  label,
  error,
  options,
  className = "",
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string | null; options: string[] }) {
  return (
    <label className={`flex flex-col gap-[6px] ${className}`}>
      <span className="px-1 text-[13px] font-medium lg:text-[14px]">{label}</span>
      <select {...select} aria-invalid={!!error} className={`${box} appearance-none bg-[length:12px] bg-[right_20px_center] bg-no-repeat ${error ? "border-red-600" : ""}`}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E\")" }}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <span className="px-1 text-[13px] text-red-700">{error}</span>}
    </label>
  )
}

export function PrimaryButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`flex h-[44px] w-full items-center justify-center rounded-full bg-black text-[16px] font-semibold text-white hover:bg-ink disabled:opacity-60 lg:h-[54px] lg:text-[18px] ${className}`}
    >
      {children}
    </button>
  )
}

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
]

// India Post / Delhivery spell some states differently.
export const matchState = (name: string | null | undefined) => {
  if (!name) return ""
  const n = name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim()
  return STATES.find((s) => s.toLowerCase() === n) ?? STATES.find((s) => n.startsWith(s.toLowerCase())) ?? ""
}
