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
  bulb: "M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.8 10.6c.8.7 1.3 1.6 1.3 2.4h5c0-.8.5-1.7 1.3-2.4A6 6 0 0 0 12 3z",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  flag: "M5 21V4h12l-2.5 4 2.5 4H5",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z",
  flame: "M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 .8-3.3 2-4.2.2 1.7.9 2.7 2 3.2.2-3-.6-6 1-9z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4",
  pawn: "M12 4a2.8 2.8 0 0 1 1.7 5c1.3.7 1.8 1.8 1.8 3h-7c0-1.2.5-2.3 1.8-3A2.8 2.8 0 0 1 12 4zM10 12c0 3-1.2 5-2.5 7h9c-1.3-2-2.5-4-2.5-7M6.5 20.5h11",
  heart: "M12 20s-7-4.3-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5c0 5.2-7 9.5-7 9.5z",
  swap: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
  mute: "M4 9v6h4l5 4V5L8 9zM17 9l4 6m0-6-4 6",
  sound: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7",
  board: "M4 4h16v16H4zM4 12h16M12 4v16M4 4h8v8H4zm8 8h8v8h-8z",
  focus: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  more: "M12 6.5v.01M12 12v.01M12 17.5v.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7.5 8c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6",
}

export function GIcon({ name, size = 22, className = "" }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? ""} />
    </svg>
  )
}
