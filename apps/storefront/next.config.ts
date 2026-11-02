import type { NextConfig } from "next"

const backend = new URL(process.env.MEDUSA_BACKEND_URL || "http://localhost:9000")

const nextConfig: NextConfig = {
  // deploy/build.sh builds into a separate folder and swaps it in only when the build
  // succeeds, so a failed build never touches the running store.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Local development serves uploads from localhost; production uses a public host.
    dangerouslyAllowLocalIP: backend.hostname === "localhost",
    remotePatterns: [
      {
        protocol: backend.protocol.replace(":", "") as "http" | "https",
        hostname: backend.hostname,
        port: backend.port,
        pathname: "/static/**",
      },
      { protocol: "https", hostname: "*.stancil.in" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
