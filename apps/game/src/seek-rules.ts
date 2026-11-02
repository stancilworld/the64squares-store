// Pure pairing rules for the "Play online" pool (tested without a database).

export const allowedGap = (waitedMs: number) => Math.min(2000, 150 + (waitedMs / 1000) * 40)

// Pairs within one time control: oldest seek first, with the closest rating both sides accept.
export const pickPairs = <T extends { rating: number; since: number; id: string }>(list: T[], now: number) => {
  const left = [...list].sort((a, b) => a.since - b.since)
  const pairs: [T, T][] = []
  while (left.length > 1) {
    const a = left.shift()!
    let best = -1
    let bestGap = Infinity
    left.forEach((b, i) => {
      const gap = Math.abs(a.rating - b.rating)
      if (b.id !== a.id && gap <= allowedGap(now - a.since) && gap <= allowedGap(now - b.since) && gap < bestGap) {
        best = i
        bestGap = gap
      }
    })
    if (best >= 0) pairs.push([a, left.splice(best, 1)[0]])
  }
  return pairs
}
