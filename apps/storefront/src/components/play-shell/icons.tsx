// Simple line icons for the game area.
const paths: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  cpu: "M7 7h10v10H7zM9.5 9.5h5v5h-5zM9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3",
  friend: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6M2 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5m2-5.4c2.5.2 4.6 2 5 5.4",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4M12 13v4m-4 3h8m-6-3h4",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3.5 2",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  back: "M15 5l-7 7 7 7",
  shop: "M5 8h14l-1.2 11H6.2zM9 8V6a3 3 0 0 1 6 0v2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  puzzle: "M10 3h4v2.5a1.5 1.5 0 1 0 3 0V3h4v7h-2.5a1.5 1.5 0 1 0 0 3H21v8h-7v-2.5a1.5 1.5 0 1 0-3 0V21H3v-8h2.5a1.5 1.5 0 1 0 0-3H3V3h7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7.5 8c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6",
}

export function GIcon({ name, size = 22, className = "" }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? ""} />
    </svg>
  )
}
