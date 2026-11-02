// Settings from the environment (deploy/setup-vps.sh writes them).
const need = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export const config = {
  port: Number(process.env.PORT || 9200),
  databaseUrl: need("DATABASE_URL"),
  // Shared with the storefront, which signs a short-lived play token for signed-in players.
  playTokenSecret: need("PLAY_TOKEN_SECRET", process.env.NODE_ENV === "production" ? undefined : "local-play-secret"),
  // Websites allowed to connect (comma-separated).
  origins: (process.env.STORE_CORS || "http://localhost:8000").split(",").map((s) => s.trim()).filter(Boolean),
}
