// Five stars, filled to the rating (halves rounded to the nearest half star).
export function Stars({ value, size = 16, className = "" }: { value: number; size?: number; className?: string }) {
  const v = Math.round(value * 2) / 2
  return (
    <span className={`inline-flex shrink-0 items-center gap-[1px] ${className}`} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = v >= i ? 1 : v >= i - 0.5 ? 0.5 : 0
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
            <defs>
              <linearGradient id={`s${i}-${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="#d99a00" />
                <stop offset={`${fill * 100}%`} stopColor="#d9d3c7" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#s${i}-${fill})`}
              d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
            />
          </svg>
        )
      })}
    </span>
  )
}
